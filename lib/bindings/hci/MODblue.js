"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HciMODblue = void 0;
const models_1 = require("../../models");
const Adapter_1 = require("./Adapter");
const misc_1 = require("./misc");
/**
 * Use the HCI socket bindings to access BLE functions.
 */
class HciMODblue extends models_1.MODblue {
    constructor() {
        super(...arguments);
        this.adapters = new Map();
    }
    async dispose() {
        for (const adapter of this.adapters.values()) {
            adapter.dispose();
        }
        this.adapters = new Map();
    }
    async getAdapters() {
        var _a;
        const adapters = misc_1.Hci.getDeviceList();
        for (const rawAdapter of adapters) {
            let adapter = this.adapters.get(rawAdapter.devId);
            if (!adapter) {
                adapter = new Adapter_1.HciAdapter(this, `hci${rawAdapter.devId}`, rawAdapter.name, (_a = rawAdapter.address) === null || _a === void 0 ? void 0 : _a.toUpperCase());
                this.adapters.set(rawAdapter.devId, adapter);
            }
        }
        return [...this.adapters.values()];
    }
}
exports.HciMODblue = HciMODblue;
//# sourceMappingURL=MODblue.js.map