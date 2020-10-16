import { GattService } from '../Service';
import { GattCharacteristicRemote } from './Characteristic';
import { GattRemote } from './Gatt';
export declare class GattServiceRemote extends GattService {
    readonly gatt: GattRemote;
    readonly characteristics: Map<string, GattCharacteristicRemote>;
    discoverCharacteristics(): Promise<GattCharacteristicRemote[]>;
}
