/// <reference types="node" />
import { GattRemote, Peripheral } from '../../../../models';
import { Hci } from '../../misc';
import { HciGattCharacteristicRemote } from './Characteristic';
import { HciGattDescriptorRemote } from './Descriptor';
import { HciGattServiceRemote } from './Service';
export declare class HciGattRemote extends GattRemote {
    private hci;
    private handle;
    private security;
    private mtuWasExchanged;
    private disposeReason;
    private mutex;
    private mutexStack;
    private currentCmd;
    private cmdTimeout;
    services: Map<string, HciGattServiceRemote>;
    constructor(peripheral: Peripheral, hci: Hci, handle: number, cmdTimeout?: number);
    private acquireMutex;
    dispose(reason?: string): void;
    private onAclStreamData;
    private errorResponse;
    private queueCommand;
    private mtuRequest;
    readByGroupRequest(startHandle: number, endHandle: number, groupUUID: number): Promise<Buffer>;
    readByTypeRequest(startHandle: number, endHandle: number, groupUUID: number): Promise<Buffer>;
    readRequest(handle: number): Promise<Buffer>;
    readBlobRequest(handle: number, offset: number): Promise<Buffer>;
    findInfoRequest(startHandle: number, endHandle: number): Promise<Buffer>;
    writeRequest(handle: number, data: Buffer, withoutResponse: false): Promise<Buffer>;
    writeRequest(handle: number, data: Buffer, withoutResponse: true): Promise<void>;
    private prepareWriteRequest;
    private executeWriteRequest;
    private handleConfirmation;
    exchangeMtu(mtu: number): Promise<number>;
    protected doDiscoverServices(): Promise<HciGattServiceRemote[]>;
    discoverCharacteristics(serviceUUID: string): Promise<HciGattCharacteristicRemote[]>;
    read(serviceUUID: string, characteristicUUID: string): Promise<Buffer>;
    write(serviceUUID: string, characteristicUUID: string, data: Buffer, withoutResponse: boolean): Promise<void>;
    private longWrite;
    broadcast(serviceUUID: string, characteristicUUID: string, broadcast: boolean): Promise<void>;
    notify(serviceUUID: string, characteristicUUID: string, notify: boolean): Promise<void>;
    discoverDescriptors(serviceUUID: string, characteristicUUID: string): Promise<HciGattDescriptorRemote[]>;
    readValue(serviceUUID: string, characteristicUUID: string, descriptorUUID: string): Promise<Buffer>;
    writeValue(serviceUUID: string, characteristicUUID: string, descriptorUUID: string, data: Buffer): Promise<void>;
}
//# sourceMappingURL=Gatt.d.ts.map