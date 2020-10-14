import { Peripheral } from '../../models';
import { AddressType } from '../../types';
import { DbusAdapter } from './Adapter';
import { DbusGattRemote } from './gatt';
export declare class DbusPeripheral extends Peripheral {
    adapter: DbusAdapter;
    readonly path: string;
    private deviceIface;
    private propsIface;
    private _init;
    private gatt;
    private isConnecting;
    private connecting;
    private connectTimeout;
    private isDisconnecting;
    private disconnecting;
    private disconnectTimeout;
    constructor(adapter: DbusAdapter, path: string, id: string, address: string, addressType: AddressType, advertisement: any, rssi: number);
    private init;
    private prop;
    private isConnected;
    connect(): Promise<void>;
    disconnect(): Promise<number>;
    private doneConnecting;
    private doneDisconnecting;
    setupGatt(requestMtu?: number): Promise<DbusGattRemote>;
}
