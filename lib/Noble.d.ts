/// <reference types="node" />
import { EventEmitter } from 'events';
export declare class Noble extends EventEmitter {
    address: string;
    state: string;
    private initialized;
    private bindings;
    private allowDuplicates;
    private discoveredPeripheralUUIDs;
    private peripherals;
    constructor(bindings: any);
    init(): Promise<void>;
    private onStateChange;
    private onAddressChange;
    startScanning(serviceUUIDs: string[], allowDuplicates?: boolean): Promise<void>;
    private onScanStart;
    stopScanning(): Promise<void>;
    private onScanStop;
    private onDiscover;
    connect(peripheralUUID: string, requestMtu?: number): void;
    private onConnect;
    disconnect(peripheralUUID: string): void;
    onDisconnect(peripheralUUID: string, reason: any): void;
    updateRSSI(peripheralUUID: string): void;
    private onRssiUpdate;
    private onServicesDiscovered;
    discoverServices(peripheralUUID: string, uuids: string[]): void;
    private onServicesDiscover;
    discoverIncludedServices(peripheralUUID: string, serviceUUID: string, serviceUUIDs: string[]): void;
    private onIncludedServicesDiscover;
    private onCharacteristicsDiscovered;
    discoverCharacteristics(peripheralUUID: string, serviceUUID: string, characteristicUUIDs: string[]): void;
    private onCharacteristicsDiscover;
    read(peripheralUUID: string, serviceUUID: string, characteristicUUID: string): void;
    private onRead;
    write(peripheralUUID: string, serviceUUID: string, characteristicUUID: string, data: any, withoutResponse: boolean): void;
    private onWrite;
    broadcast(peripheralUUID: string, serviceUUID: string, characteristicUUID: string, broadcast: any): void;
    private onBroadcast;
    notify(peripheralUUID: string, serviceUUID: string, characteristicUUID: string, notify: boolean): void;
    private onNotify;
    discoverDescriptors(peripheralUUID: string, serviceUUID: string, characteristicUUID: string): void;
    private onDescriptorsDiscover;
    readValue(peripheralUUID: string, serviceUUID: string, characteristicUUID: string, descriptorUUID: string): void;
    private onValueRead;
    writeValue(peripheralUUID: string, serviceUUID: string, characteristicUUID: string, descriptorUUID: string, data: any): void;
    private onValueWrite;
    readHandle(peripheralUUID: string, handle: number): void;
    private onHandleRead;
    writeHandle(peripheralUUID: string, handle: number, data: any, withoutResponse: boolean): void;
    private onHandleWrite;
    private onHandleNotify;
    private onMtu;
}
