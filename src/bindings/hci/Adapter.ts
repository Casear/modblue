import { Adapter, AddressType, Peripheral } from '../../models';

import { HciGattLocal } from './gatt';
import { Gap, Hci } from './misc';
import { HciPeripheral } from './Peripheral';

const SCAN_ENABLE_TIMEOUT = 5000;
const ADVERTISING_ENABLE_TIMEOUT = 5000;

interface Advertisement {
	localName: string;
	txPowerLevel: number;
	manufacturerData: Buffer;
	serviceData: { uuid: string; data: Buffer }[];
	serviceUuids: string[];
	solicitationServiceUuids: string[];
}

export class HciAdapter extends Adapter {
	private initialized = false;

	private scanning = false;
	private scanEnableTimer: NodeJS.Timer;

	private advertising = false;
	private advertisingEnableTimer: NodeJS.Timer;
	private wasAdvertising = false;

	private hci: Hci;
	private gap: Gap;
	private gatt: HciGattLocal;
	private deviceName: string = this.id;
	private advertisedServiceUUIDs: string[] = [];
	private peripherals: Map<string, HciPeripheral> = new Map();
	private connectedDevices: Map<number, HciPeripheral> = new Map();
	private uuidToHandle: Map<string, number> = new Map();
	private handleToUUID: Map<number, string> = new Map();

	private async init() {
		if (this.initialized) {
			return;
		}

		let devId: number | { bus: number; address: number };
		if (this.id.includes('-')) {
			const splits = this.id.split('-');
			devId = { bus: Number(splits[0]), address: Number(splits[1]) };
		} else {
			devId = Number(this.id);
		}

		this.hci = new Hci(devId);

		await this.hci.init();

		// Don't listen for events until init is done
		this.hci.on('hciError', this.onHciError);
		this.hci.on('stateChange', this.onHciStateChange);
		this.hci.on('leScanEnable', this.onLeScanEnable);
		this.hci.on('leAdvertiseEnable', this.onLeAdvertiseEnable);
		this.hci.on('leConnComplete', this.onLeConnComplete);
		this.hci.on('disconnectComplete', this.onDisconnectComplete);

		this.gap = new Gap(this.hci);
		this.gap.on('discover', this.onDiscover);

		this._address = this.hci.address?.toLowerCase();
		this._addressType = this.hci.addressType;

		this.initialized = true;
	}

	private onHciStateChange = (newState: string) => {
		// If the underlaying socket shuts down we're doomed
		if (newState === 'poweredOff') {
			this.dispose();
		}
	};

	private onHciError = (error: Error) => {
		this.emit('error', error);
		if (this.initialized) {
			this.hci.reset().catch((err) => this.emit('error', new Error(`Could not reset HCI controller: ${err}`)));
		}
	};

	public dispose(): void {
		for (const device of this.connectedDevices.values()) {
			device.onDisconnect('Underlaying adapter disposed');
		}
		this.connectedDevices.clear();

		if (this.hci) {
			this.hci.removeAllListeners();
			this.hci.dispose();
			this.hci = null;
		}

		if (this.gap) {
			this.gap.removeAllListeners();
			this.gap = null;
		}

		this._address = null;
		this._addressType = null;
		this.initialized = false;
	}

	public isScanning(): boolean {
		return this.scanning;
	}

	public async startScanning(): Promise<void> {
		await this.init();

		if (this.scanning) {
			return;
		}

		this.peripherals.clear();
		await this.gap.startScanning(true);

		this.scanning = true;
	}

	public async stopScanning(): Promise<void> {
		if (this.scanEnableTimer) {
			clearTimeout(this.scanEnableTimer);
			this.scanEnableTimer = null;
		}

		if (!this.scanning) {
			return;
		}

		this.scanning = false;

		await this.gap.stopScanning();
	}

	public async getScannedPeripherals(): Promise<Peripheral[]> {
		return [...this.peripherals.values()];
	}

	private onDiscover = (
		address: string,
		addressType: AddressType,
		connectable: boolean,
		adv: Advertisement,
		rssi: number
	) => {
		address = address.toLowerCase();
		const uuid = address;

		let peripheral = this.peripherals.get(uuid);
		if (!peripheral) {
			peripheral = new HciPeripheral(this, uuid, adv.localName, addressType, address, adv.manufacturerData, rssi);
			this.peripherals.set(uuid, peripheral);
		} else {
			peripheral.manufacturerData = adv.manufacturerData;
			peripheral.rssi = rssi;
		}

		this.emit('discover', peripheral);
	};

	public async connect(
		peripheral: HciPeripheral,
		minInterval?: number,
		maxInterval?: number,
		latency?: number,
		supervisionTimeout?: number
	): Promise<void> {
		// For BLE <= 4.2:
		// - Disable advertising while we're connected.
		// - Don't connect if we have a connection in master mode
		let advertisingWasDisabled = false;
		if (this.hci.hciVersion < 8) {
			if ([...this.connectedDevices.values()].some((d) => d.isMaster)) {
				throw new Error(`Connecting in master & slave role concurrently is only supported in BLE 5+`);
			}

			if (this.advertising) {
				try {
					await this.stopAdvertising();
					this.wasAdvertising = true;
					advertisingWasDisabled = true;
				} catch (err) {
					this.emit('error', new Error(`Could not disable advertising before connecting: ${err}`));
				}
			}
		}

		try {
			const handle = await this.hci.createLeConn(
				peripheral.address,
				peripheral.addressType,
				minInterval,
				maxInterval,
				latency,
				supervisionTimeout
			);

			this.uuidToHandle.set(peripheral.uuid, handle);
			this.handleToUUID.set(handle, peripheral.uuid);

			peripheral.onConnect(false, this.hci, handle);
			this.connectedDevices.set(handle, peripheral);
		} catch (err) {
			// Dispose anything in case we got a partial setup/connection done
			peripheral.onDisconnect();

			// Re-enable advertising since we didn't establish a connection
			if (advertisingWasDisabled) {
				await this.startAdvertising(this.deviceName, this.advertisedServiceUUIDs);
				this.wasAdvertising = false;
			}

			// Rethrow
			throw err;
		}
	}

	public async disconnect(peripheral: HciPeripheral): Promise<void> {
		const handle = this.uuidToHandle.get(peripheral.uuid);

		try {
			await this.hci.disconnect(handle);
		} catch {
			// NO-OP
		} finally {
			peripheral.onDisconnect();
		}
	}

	public isAdvertising(): boolean {
		return this.advertising;
	}

	public async startAdvertising(deviceName: string, serviceUUIDs: string[] = [], manufacturerData?: string): Promise<void> {
		await this.init();

		if (this.advertising) {
			return;
		}

		if (!this.gatt) {
			throw new Error('You have to setup the local GATT server before advertising');
		}

		this.deviceName = deviceName;
		this.advertisedServiceUUIDs = serviceUUIDs;
		await this.gatt.prepare(this.deviceName);

		await this.gap.startAdvertising(this.deviceName, serviceUUIDs, manufacturerData);

		this.advertising = true;
	}

	public async stopAdvertising(): Promise<void> {
		if (this.advertisingEnableTimer) {
			clearTimeout(this.advertisingEnableTimer);
			this.advertisingEnableTimer = null;
		}

		if (!this.advertising) {
			return;
		}

		try {
			await this.gap.stopAdvertising();
		} catch {
			// NO-OP: Errors here probably mean we already stopped advertising
		}

		this.advertising = false;
	}

	public async setupGatt(maxMtu?: number): Promise<HciGattLocal> {
		await this.init();

		if (!this.gatt) {
			this.gatt = new HciGattLocal(this, this.hci, maxMtu);
		}

		return this.gatt;
	}

	private onLeScanEnable = (enabled: boolean) => {
		// We have to restart scanning if we were scanning before
		if (this.scanning && !enabled) {
			this.scanning = false;
			const enableScanning = () => {
				this.startScanning()
					.then(() => {
						this.scanEnableTimer = null;
					})
					.catch((err) => {
						this.emit('error', new Error(`Could not re-enable LE scanning: ${err}`));
						this.scanEnableTimer = setTimeout(() => enableScanning(), SCAN_ENABLE_TIMEOUT);
					});
			};
			this.scanEnableTimer = setTimeout(() => enableScanning(), SCAN_ENABLE_TIMEOUT);
		}
	};

	private onLeAdvertiseEnable = (enabled: boolean) => {
		// We have to restart advertising if we were advertising before
		if (this.advertising && !enabled) {
			this.advertising = false;
			const enableAdvertising = () => {
				this.startAdvertising(this.deviceName, this.advertisedServiceUUIDs)
					.then(() => {
						this.advertisingEnableTimer = null;
					})
					.catch((err) => {
						this.emit('error', new Error(`Could not re-enable LE advertising: ${err}`));
						this.advertisingEnableTimer = setTimeout(() => enableAdvertising(), ADVERTISING_ENABLE_TIMEOUT);
					});
			};
			this.advertisingEnableTimer = setTimeout(() => enableAdvertising(), ADVERTISING_ENABLE_TIMEOUT);
		}
	};

	private onLeConnComplete = (
		status: number,
		handle: number,
		role: number,
		addressType: AddressType,
		address: string
	) => {
		// Skip failed or master connections, they are handled elsewhere
		if (status !== 0 || role === 0) {
			return;
		}

		address = address.toLowerCase();
		const uuid = address;

		const peripheral = new HciPeripheral(this, uuid, undefined, addressType, address, null, 0);
		peripheral.onConnect(true, this.hci, handle);

		this.connectedDevices.set(handle, peripheral);
		this.emit('connect', peripheral);

		// Advertising automatically stops, so change the state accordingly
		this.wasAdvertising = true;
		this.advertising = false;
	};

	private onDisconnectComplete = (status: number, handle: number, reason?: string) => {
		// Check if we have a connected device and remove it
		const connectedDevice = this.connectedDevices.get(handle);
		if (connectedDevice) {
			connectedDevice.onDisconnect(reason);
			this.connectedDevices.delete(handle);

			// If the device was connected in master mode we inform our local listeners
			if (connectedDevice.isMaster) {
				this.emit('disconnect', connectedDevice, reason);
			}
		}

		// We have to restart advertising if we were advertising before, and if all devices disconnected
		if (this.wasAdvertising && this.connectedDevices.size === 0) {
			this.startAdvertising(this.deviceName, this.advertisedServiceUUIDs).catch((err) =>
				this.emit('error', new Error(`Could not re-enable advertising after disconnect: ${err}`))
			);
			this.wasAdvertising = false;
		}
	};
}
