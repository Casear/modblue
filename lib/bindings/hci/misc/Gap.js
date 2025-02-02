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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Gap = void 0;
const os_1 = __importDefault(require("os"));
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
const IS_NTC_CHIP = os_1.default.platform() === 'linux' && os_1.default.release().indexOf('-ntc') !== -1;
const IS_LINUX = os_1.default.platform() === 'linux';
const IS_INTEL_EDISON = IS_LINUX && os_1.default.release().indexOf('edison') !== -1;
const IS_YOCTO = IS_LINUX && os_1.default.release().indexOf('yocto') !== -1;
class Gap extends tiny_typed_emitter_1.TypedEmitter {
    constructor(hci) {
        super();
        this.onHciLeAdvertisingReport = (type, address, addressType, eir, rssi) => {
            const previouslyDiscovered = this.discoveries.get(address);
            const advertisement = (previouslyDiscovered === null || previouslyDiscovered === void 0 ? void 0 : previouslyDiscovered.advertisement) || {
                localName: undefined,
                txPowerLevel: undefined,
                manufacturerData: undefined,
                serviceData: [],
                serviceUuids: [],
                solicitationServiceUuids: []
            };
            let discoveryCount = (previouslyDiscovered === null || previouslyDiscovered === void 0 ? void 0 : previouslyDiscovered.count) || 0;
            let hasScanResponse = (previouslyDiscovered === null || previouslyDiscovered === void 0 ? void 0 : previouslyDiscovered.hasScanResponse) || false;
            if (type === 0x04) {
                hasScanResponse = true;
            }
            else {
                // reset service data every non-scan response event
                advertisement.serviceData = [];
                advertisement.serviceUuids = [];
                advertisement.solicitationServiceUuids = [];
            }
            discoveryCount++;
            let i = 0;
            while (i + 1 < eir.length) {
                const length = eir.readUInt8(i);
                if (length < 1) {
                    break;
                }
                // https://www.bluetooth.org/en-us/specification/assigned-numbers/generic-access-profile
                const eirType = eir.readUInt8(i + 1);
                if (i + length + 1 > eir.length) {
                    break;
                }
                const bytes = eir.slice(i + 2).slice(0, length - 1);
                switch (eirType) {
                    case 0x02: // Incomplete List of 16-bit Service Class UUID
                    case 0x03: // Complete List of 16-bit Service Class UUIDs
                        for (let j = 0; j < bytes.length; j += 2) {
                            const serviceUuid = bytes.readUInt16LE(j).toString(16);
                            if (advertisement.serviceUuids.indexOf(serviceUuid) === -1) {
                                advertisement.serviceUuids.push(serviceUuid);
                            }
                        }
                        break;
                    case 0x06: // Incomplete List of 128-bit Service Class UUIDs
                    case 0x07: // Complete List of 128-bit Service Class UUIDs
                        for (let j = 0; j < bytes.length; j += 16) {
                            const serviceUuid = bytes
                                .slice(j, j + 16)
                                .toString('hex')
                                .match(/.{1,2}/g)
                                .reverse()
                                .join('');
                            if (advertisement.serviceUuids.indexOf(serviceUuid) === -1) {
                                advertisement.serviceUuids.push(serviceUuid);
                            }
                        }
                        break;
                    case 0x08: // Shortened Local Name
                    case 0x09: // Complete Local Name»
                        advertisement.localName = bytes.toString('utf8');
                        break;
                    case 0x0a: // Tx Power Level
                        advertisement.txPowerLevel = bytes.readInt8(0);
                        break;
                    case 0x14: // List of 16 bit solicitation UUIDs
                        for (let j = 0; j < bytes.length; j += 2) {
                            const serviceSolicitationUuid = bytes.readUInt16LE(j).toString(16);
                            if (advertisement.solicitationServiceUuids.indexOf(serviceSolicitationUuid) === -1) {
                                advertisement.solicitationServiceUuids.push(serviceSolicitationUuid);
                            }
                        }
                        break;
                    case 0x15: // List of 128 bit solicitation UUIDs
                        for (let j = 0; j < bytes.length; j += 16) {
                            const serviceSolicitationUuid = bytes
                                .slice(j, j + 16)
                                .toString('hex')
                                .match(/.{1,2}/g)
                                .reverse()
                                .join('');
                            if (advertisement.solicitationServiceUuids.indexOf(serviceSolicitationUuid) === -1) {
                                advertisement.solicitationServiceUuids.push(serviceSolicitationUuid);
                            }
                        }
                        break;
                    case 0x16: // 16-bit Service Data, there can be multiple occurences
                        advertisement.serviceData.push({
                            uuid: bytes
                                .slice(0, 2)
                                .toString('hex')
                                .match(/.{1,2}/g)
                                .reverse()
                                .join(''),
                            data: bytes.slice(2, bytes.length)
                        });
                        break;
                    case 0x20: // 32-bit Service Data, there can be multiple occurences
                        advertisement.serviceData.push({
                            uuid: bytes
                                .slice(0, 4)
                                .toString('hex')
                                .match(/.{1,2}/g)
                                .reverse()
                                .join(''),
                            data: bytes.slice(4, bytes.length)
                        });
                        break;
                    case 0x21: // 128-bit Service Data, there can be multiple occurences
                        advertisement.serviceData.push({
                            uuid: bytes
                                .slice(0, 16)
                                .toString('hex')
                                .match(/.{1,2}/g)
                                .reverse()
                                .join(''),
                            data: bytes.slice(16, bytes.length)
                        });
                        break;
                    case 0x1f: // List of 32 bit solicitation UUIDs
                        for (let j = 0; j < bytes.length; j += 4) {
                            const serviceSolicitationUuid = bytes.readUInt32LE(j).toString(16);
                            if (advertisement.solicitationServiceUuids.indexOf(serviceSolicitationUuid) === -1) {
                                advertisement.solicitationServiceUuids.push(serviceSolicitationUuid);
                            }
                        }
                        break;
                    case 0xff: // Manufacturer Specific Data
                        advertisement.manufacturerData = bytes;
                        break;
                    default:
                        break;
                }
                i += length + 1;
            }
            const connectable = type === 0x04 && previouslyDiscovered ? previouslyDiscovered.connectable : type !== 0x03;
            this.discoveries.set(address, {
                address: address,
                addressType: addressType,
                connectable: connectable,
                advertisement: advertisement,
                rssi: rssi,
                count: discoveryCount,
                hasScanResponse: hasScanResponse
            });
            // only report after a scan response event or if non-connectable or more than one discovery without a scan response,
            // so more data can be collected
            if (type === 0x04 || !connectable || (discoveryCount > 1 && !hasScanResponse)) {
                this.emit('discover', address, addressType, connectable, advertisement, rssi);
            }
        };
        this.hci = hci;
        this.scanState = null;
        this.scanFilterDuplicates = null;
        this.discoveries = new Map();
        this.hci.on('leAdvertisingReport', this.onHciLeAdvertisingReport);
    }
    startScanning(allowDuplicates) {
        return __awaiter(this, void 0, void 0, function* () {
            this.scanState = 'starting';
            this.scanFilterDuplicates = !allowDuplicates;
            // Always set scan parameters before scanning
            // https://www.bluetooth.org/docman/handlers/downloaddoc.ashx?doc_id=229737
            // p106 - p107
            try {
                yield this.hci.setScanEnabled(false, true);
            }
            catch (_a) {
                // NO-OP
            }
            yield this.hci.setScanParameters();
            if (IS_NTC_CHIP) {
                // work around for Next Thing Co. C.H.I.P, always allow duplicates, to get scan response
                this.scanFilterDuplicates = false;
            }
            yield this.hci.setScanEnabled(true, this.scanFilterDuplicates);
            this.scanState = 'started';
        });
    }
    stopScanning() {
        return __awaiter(this, void 0, void 0, function* () {
            this.scanState = 'stopping';
            yield this.hci.setScanEnabled(false, this.scanFilterDuplicates);
            this.scanState = 'stopped';
        });
    }
    startAdvertising(name, serviceUuids, manufacturerData) {
        return __awaiter(this, void 0, void 0, function* () {
            let advertisementDataLength = 3;
            let scanDataLength = 0;
            const serviceUuids16bit = [];
            const serviceUuids128bit = [];
            let i = 0;
            if (name && name.length) {
                scanDataLength += 2 + name.length;
            }
            if (manufacturerData && manufacturerData.length) {
                scanDataLength += 2 + manufacturerData.length / 2;
            }
            if (serviceUuids && serviceUuids.length) {
                for (i = 0; i < serviceUuids.length; i++) {
                    const serviceUuid = Buffer.from(serviceUuids[i]
                        .match(/.{1,2}/g)
                        .reverse()
                        .join(''), 'hex');
                    if (serviceUuid.length === 2) {
                        serviceUuids16bit.push(serviceUuid);
                    }
                    else if (serviceUuid.length === 16) {
                        serviceUuids128bit.push(serviceUuid);
                    }
                }
            }
            if (serviceUuids16bit.length) {
                advertisementDataLength += 2 + 2 * serviceUuids16bit.length;
            }
            if (serviceUuids128bit.length) {
                advertisementDataLength += 2 + 16 * serviceUuids128bit.length;
            }
            const advertisementData = Buffer.alloc(advertisementDataLength);
            const scanData = Buffer.alloc(scanDataLength);
            // flags
            advertisementData.writeUInt8(2, 0);
            advertisementData.writeUInt8(0x01, 1);
            advertisementData.writeUInt8(0x06, 2);
            let advertisementDataOffset = 3;
            if (serviceUuids16bit.length) {
                advertisementData.writeUInt8(1 + 2 * serviceUuids16bit.length, advertisementDataOffset);
                advertisementDataOffset++;
                advertisementData.writeUInt8(0x03, advertisementDataOffset);
                advertisementDataOffset++;
                for (i = 0; i < serviceUuids16bit.length; i++) {
                    serviceUuids16bit[i].copy(advertisementData, advertisementDataOffset);
                    advertisementDataOffset += serviceUuids16bit[i].length;
                }
            }
            if (serviceUuids128bit.length) {
                advertisementData.writeUInt8(1 + 16 * serviceUuids128bit.length, advertisementDataOffset);
                advertisementDataOffset++;
                advertisementData.writeUInt8(0x06, advertisementDataOffset);
                advertisementDataOffset++;
                for (i = 0; i < serviceUuids128bit.length; i++) {
                    serviceUuids128bit[i].copy(advertisementData, advertisementDataOffset);
                    advertisementDataOffset += serviceUuids128bit[i].length;
                }
            }
            console.log(advertisementData);
            // name
            let index = 0;
            if (name && name.length) {
                const nameBuffer = Buffer.from(name);
                scanData.writeUInt8(1 + nameBuffer.length, 0);
                scanData.writeUInt8(0x08, 1);
                nameBuffer.copy(scanData, 2);
                index = 2 + nameBuffer.length;
            }
            if (manufacturerData && manufacturerData.length) {
                const manufacturerDataBuffer = Buffer.from(manufacturerData, "hex");
                scanData.writeUInt8(1 + manufacturerDataBuffer.length, index);
                scanData.writeUInt8(0xFF, index + 1);
                manufacturerDataBuffer.copy(scanData, index + 2);
            }
            console.log(advertisementData);
            console.log(scanData);
            yield this.startAdvertisingWithEIRData(advertisementData, scanData);
        });
    }
    startAdvertisingWithEIRData(advertisementData = Buffer.alloc(0), scanData = Buffer.alloc(0)) {
        return __awaiter(this, void 0, void 0, function* () {
            if (advertisementData.length > 31) {
                console.log(advertisementData.length);
                throw new Error('Advertisement data is over maximum limit of 31 bytes');
            }
            else if (scanData.length > 31) {
                throw new Error('Scan data is over maximum limit of 31 bytes');
            }
            this.advertiseState = 'starting';
            try {
                yield this.hci.setAdvertisingEnabled(false);
            }
            catch (_a) {
                // NO-OP
            }
            if (IS_INTEL_EDISON || IS_YOCTO) {
                // work around for Intel Edison
            }
            else {
                yield this.hci.setScanResponseData(scanData);
                yield this.hci.setAdvertisingData(advertisementData);
            }
            yield this.hci.setAdvertisingEnabled(true);
            yield this.hci.setScanResponseData(scanData);
            yield this.hci.setAdvertisingData(advertisementData);
            this.advertiseState = 'started';
        });
    }
    stopAdvertising() {
        return __awaiter(this, void 0, void 0, function* () {
            this.advertiseState = 'stopping';
            yield this.hci.setAdvertisingEnabled(false);
            this.advertiseState = 'stopped';
        });
    }
}
exports.Gap = Gap;
//# sourceMappingURL=Gap.js.map