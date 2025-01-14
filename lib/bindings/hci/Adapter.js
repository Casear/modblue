"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HciAdapter = void 0;
const models_1 = require("../../models");
const gatt_1 = require("./gatt");
const misc_1 = require("./misc");
const Peripheral_1 = require("./Peripheral");
const SCAN_ENABLE_TIMEOUT = 5000;
const ADVERTISING_ENABLE_TIMEOUT = 5000;
class HciAdapter extends models_1.Adapter {
    constructor() {
        super(...arguments);
        this.initialized = false;
        this.scanning = false;
        this.advertising = false;
        this.wasAdvertising = false;
        this.deviceName = this.id;
        this.advertisedServiceUUIDs = [];
        this.peripherals = new Map();
        this.connectedDevices = new Map();
        this.uuidToHandle = new Map();
        this.handleToUUID = new Map();
        this.onHciStateChange = (newState) => {
            // If the underlaying socket shuts down we're doomed
            if (newState === 'poweredOff') {
                this.dispose();
            }
        };
        this.onHciError = (error) => {
            this.emit('error', error);
            if (this.initialized) {
                this.hci.reset().catch((err) => this.emit('error', new Error(`Could not reset HCI controller: ${err}`)));
            }
        };
        this.onDiscover = (address, addressType, connectable, adv, rssi) => {
            address = address.toLowerCase();
            const uuid = address;
            let peripheral = this.peripherals.get(uuid);
            if (!peripheral) {
                peripheral = new Peripheral_1.HciPeripheral(this, uuid, adv.localName, addressType, address, adv.manufacturerData, rssi);
                this.peripherals.set(uuid, peripheral);
            }
            else {
                peripheral.manufacturerData = adv.manufacturerData;
                peripheral.rssi = rssi;
            }
            this.emit('discover', peripheral);
        };
        this.onLeScanEnable = (enabled) => {
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
        this.onLeAdvertiseEnable = (enabled) => {
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
        this.onLeConnComplete = (status, handle, role, addressType, address) => {
            // Skip failed or master connections, they are handled elsewhere
            if (status !== 0 || role === 0) {
                return;
            }
            address = address.toLowerCase();
            const uuid = address;
            const peripheral = new Peripheral_1.HciPeripheral(this, uuid, undefined, addressType, address, null, 0);
            peripheral.onConnect(true, this.hci, handle);
            this.connectedDevices.set(handle, peripheral);
            this.emit('connect', peripheral);
            // Advertising automatically stops, so change the state accordingly
            this.wasAdvertising = true;
            this.advertising = false;
        };
        this.onDisconnectComplete = (status, handle, reason) => {
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
                this.startAdvertising(this.deviceName, this.advertisedServiceUUIDs).catch((err) => this.emit('error', new Error(`Could not re-enable advertising after disconnect: ${err}`)));
                this.wasAdvertising = false;
            }
        };
    }
    init() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initialized) {
                return;
            }
            let devId;
            if (this.id.includes('-')) {
                const splits = this.id.split('-');
                devId = { bus: Number(splits[0]), address: Number(splits[1]) };
            }
            else {
                devId = Number(this.id);
            }
            this.hci = new misc_1.Hci(devId);
            yield this.hci.init();
            // Don't listen for events until init is done
            this.hci.on('hciError', this.onHciError);
            this.hci.on('stateChange', this.onHciStateChange);
            this.hci.on('leScanEnable', this.onLeScanEnable);
            this.hci.on('leAdvertiseEnable', this.onLeAdvertiseEnable);
            this.hci.on('leConnComplete', this.onLeConnComplete);
            this.hci.on('disconnectComplete', this.onDisconnectComplete);
            this.gap = new misc_1.Gap(this.hci);
            this.gap.on('discover', this.onDiscover);
            this._address = (_a = this.hci.address) === null || _a === void 0 ? void 0 : _a.toLowerCase();
            this._addressType = this.hci.addressType;
            this.initialized = true;
        });
    }
    dispose() {
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
    isScanning() {
        return this.scanning;
    }
    startScanning() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.init();
            if (this.scanning) {
                return;
            }
            this.peripherals.clear();
            yield this.gap.startScanning(true);
            this.scanning = true;
        });
    }
    stopScanning() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.scanEnableTimer) {
                clearTimeout(this.scanEnableTimer);
                this.scanEnableTimer = null;
            }
            if (!this.scanning) {
                return;
            }
            this.scanning = false;
            yield this.gap.stopScanning();
        });
    }
    getScannedPeripherals() {
        return __awaiter(this, void 0, void 0, function* () {
            return [...this.peripherals.values()];
        });
    }
    connect(peripheral, minInterval, maxInterval, latency, supervisionTimeout) {
        return __awaiter(this, void 0, void 0, function* () {
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
                        yield this.stopAdvertising();
                        this.wasAdvertising = true;
                        advertisingWasDisabled = true;
                    }
                    catch (err) {
                        this.emit('error', new Error(`Could not disable advertising before connecting: ${err}`));
                    }
                }
            }
            try {
                const handle = yield this.hci.createLeConn(peripheral.address, peripheral.addressType, minInterval, maxInterval, latency, supervisionTimeout);
                this.uuidToHandle.set(peripheral.uuid, handle);
                this.handleToUUID.set(handle, peripheral.uuid);
                peripheral.onConnect(false, this.hci, handle);
                this.connectedDevices.set(handle, peripheral);
            }
            catch (err) {
                // Dispose anything in case we got a partial setup/connection done
                peripheral.onDisconnect();
                // Re-enable advertising since we didn't establish a connection
                if (advertisingWasDisabled) {
                    yield this.startAdvertising(this.deviceName, this.advertisedServiceUUIDs);
                    this.wasAdvertising = false;
                }
                // Rethrow
                throw err;
            }
        });
    }
    disconnect(peripheral) {
        return __awaiter(this, void 0, void 0, function* () {
            const handle = this.uuidToHandle.get(peripheral.uuid);
            try {
                yield this.hci.disconnect(handle);
            }
            catch (_a) {
                // NO-OP
            }
            finally {
                peripheral.onDisconnect();
            }
        });
    }
    isAdvertising() {
        return this.advertising;
    }
    startAdvertising(deviceName, serviceUUIDs = [], manufacturerData) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.init();
            if (this.advertising) {
                return;
            }
            if (!this.gatt) {
                throw new Error('You have to setup the local GATT server before advertising');
            }
            this.deviceName = deviceName;
            this.advertisedServiceUUIDs = serviceUUIDs;
            yield this.gatt.prepare(this.deviceName);
            yield this.gap.startAdvertising(this.deviceName, serviceUUIDs, manufacturerData);
            this.advertising = true;
        });
    }
    stopAdvertising() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.advertisingEnableTimer) {
                clearTimeout(this.advertisingEnableTimer);
                this.advertisingEnableTimer = null;
            }
            if (!this.advertising) {
                return;
            }
            try {
                yield this.gap.stopAdvertising();
            }
            catch (_a) {
                // NO-OP: Errors here probably mean we already stopped advertising
            }
            this.advertising = false;
        });
    }
    setupGatt(maxMtu) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.init();
            if (!this.gatt) {
                this.gatt = new gatt_1.HciGattLocal(this, this.hci, maxMtu);
            }
            return this.gatt;
        });
    }
}
exports.HciAdapter = HciAdapter;
//# sourceMappingURL=Adapter.js.map