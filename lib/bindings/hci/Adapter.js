"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Adapter = void 0;
const Adapter_1 = require("../../Adapter");
const gap_1 = require("./gap");
const hci_1 = require("./hci");
const Peripheral_1 = require("./Peripheral");
class Adapter extends Adapter_1.BaseAdapter {
    constructor() {
        super(...arguments);
        this.initialized = false;
        this.scanning = false;
        this.requestScanStop = false;
        this.peripherals = new Map();
        this.uuidToHandle = new Map();
        this.handleToUUID = new Map();
        this.connectionRequestQueue = [];
        this.onScanStart = () => {
            this.scanning = true;
        };
        this.onScanStop = () => {
            this.scanning = false;
            if (this.requestScanStop) {
                this.requestScanStop = false;
                return;
            }
            // Some adapters stop scanning when connecting. We want to automatically start scanning again.
            this.startScanning().catch(() => {
                // NO-OP
            });
        };
        this.onDiscover = (status, address, addressType, connectable, advertisement, rssi) => {
            const uuid = address.toUpperCase();
            let peripheral = this.peripherals.get(uuid);
            if (!peripheral) {
                peripheral = new Peripheral_1.Peripheral(this.noble, this, uuid, address, addressType, connectable, advertisement, rssi);
                this.peripherals.set(uuid, peripheral);
            }
            else {
                peripheral.connectable = connectable;
                peripheral.advertisement = advertisement;
                peripheral.rssi = rssi;
            }
            this.emit('discover', peripheral);
        };
        this.onLeConnComplete = async (status, handle, role, addressType, address, interval, latency, supervisionTimeout, masterClockAccuracy) => {
            if (role !== 0) {
                // not master, ignore
                console.log(`Ignoring connection to ${address} because we're not master`);
                return;
            }
            const uuid = address.toUpperCase();
            const peripheral = this.peripherals.get(uuid);
            if (!peripheral) {
                console.log(`Unknown peripheral ${address} connected`);
                return;
            }
            const request = this.connectionRequest;
            if (request.peripheral !== peripheral) {
                console.log(`Peripheral ${address} connected, but we requested ${request.peripheral.address}`);
                return;
            }
            if (status === 0) {
                this.uuidToHandle.set(uuid, handle);
                this.handleToUUID.set(handle, uuid);
                await peripheral.onConnect(this.hci, handle);
                if (!request.isDone) {
                    request.isDone = true;
                    request.resolve();
                }
            }
            else {
                const statusMessage = (hci_1.Hci.STATUS_MAPPER[status] || 'HCI Error: Unknown') + ` (0x${status.toString(16)})`;
                if (!request.isDone) {
                    request.isDone = true;
                    request.reject(new Error(statusMessage));
                }
            }
            this.connectionRequest = null;
            if (this.connectionRequestQueue.length > 0) {
                const newRequest = this.connectionRequestQueue.shift();
                this.connectionRequest = newRequest;
                this.hci.createLeConn(newRequest.peripheral.address, newRequest.peripheral.addressType);
            }
        };
    }
    async getScannedPeripherals() {
        return [...this.peripherals.values()];
    }
    async isScanning() {
        return this.scanning;
    }
    async init() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.hci = new hci_1.Hci(Number(this.id));
        this.hci.on('addressChange', (addr) => (this._address = addr));
        this.hci.on('leConnComplete', this.onLeConnComplete);
        this.gap = new gap_1.Gap(this.hci);
        this.gap.on('scanStart', this.onScanStart);
        this.gap.on('scanStop', this.onScanStop);
        this.gap.on('discover', this.onDiscover);
        await this.hci.init();
    }
    dispose() {
        if (!this.initialized) {
            return;
        }
        this.initialized = false;
        this.hci.removeAllListeners();
        this.hci.dispose();
        this.hci = null;
        this.gap.removeAllListeners();
        this.gap = null;
    }
    async startScanning() {
        await this.init();
        return new Promise((resolve) => {
            const done = () => {
                this.gap.off('scanStart', done);
                resolve();
            };
            this.gap.on('scanStart', done);
            this.gap.startScanning(true);
        });
    }
    async stopScanning() {
        return new Promise((resolve) => {
            const done = () => {
                this.gap.off('scanStop', done);
                resolve();
            };
            this.gap.on('scanStop', done);
            this.requestScanStop = true;
            this.gap.stopScanning();
        });
    }
    async connect(peripheral) {
        const request = { peripheral, isDone: false };
        if (!this.connectionRequest) {
            this.connectionRequest = request;
            this.hci.createLeConn(request.peripheral.address, request.peripheral.addressType);
        }
        else {
            this.connectionRequestQueue.push(request);
        }
        const disconnect = (disconnHandle, reason) => {
            // If the device connected then the handle should be there
            const handle = this.uuidToHandle.get(peripheral.uuid);
            if (!handle || disconnHandle !== handle) {
                // This isn't our peripheral, ignore
                return;
            }
            peripheral.onDisconnect();
            this.uuidToHandle.delete(peripheral.uuid);
            this.handleToUUID.delete(handle);
            this.hci.off('disconnComplete', disconnect);
            if (!request.isDone) {
                request.isDone = true;
                request.reject(new Error(`Disconnect while connecting: Code ${reason}`));
            }
        };
        // Add a disconnect handler in case our peripheral gets disconnect while connecting
        this.hci.on('disconnComplete', disconnect);
        // Create a promise to resolve once the connection request is done
        // (we may have to wait in queue for other connections to complete first)
        // tslint:disable-next-line: promise-must-complete
        return new Promise((res, rej) => {
            request.resolve = () => {
                this.hci.off('disconnComplete', disconnect);
                res();
            };
            request.reject = rej;
        });
    }
    async disconnect(peripheral) {
        const handle = this.uuidToHandle.get(peripheral.uuid);
        return new Promise((resolve) => {
            const done = (disconnHandle, reason) => {
                if (disconnHandle !== handle) {
                    // This isn't our peripheral, ignore
                    return;
                }
                peripheral.onDisconnect();
                this.uuidToHandle.delete(peripheral.uuid);
                this.handleToUUID.delete(handle);
                this.hci.off('disconnComplete', done);
                resolve(reason);
            };
            this.hci.on('disconnComplete', done);
            this.hci.disconnect(handle);
        });
    }
}
exports.Adapter = Adapter;
//# sourceMappingURL=Adapter.js.map