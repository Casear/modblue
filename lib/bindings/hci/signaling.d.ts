import { Hci } from './hci';
export declare class Signaling {
    private hci;
    private handle;
    constructor(hci: Hci, handle: number);
    dispose(): void;
    private onAclStreamData;
    private processConnectionParameterUpdateRequest;
}