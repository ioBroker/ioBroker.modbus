import ModbusTemplate, { type Modbus } from '@iobroker/modbus';
import type { AdapterOptions } from '@iobroker/adapter-core';

export class ModbusAdapter extends ModbusTemplate {
    declare config: Modbus.ModbusAdapterConfig;
    public constructor(options: Partial<AdapterOptions> = {}) {
        super('modbus', options, {
            onBeforeReady: async (): Promise<void> => {
                // Backwards compatibility
                if (
                    (!this.config.params.host && this.config.params.bind) ||
                    // @ts-expect-error backwards compatibility
                    (this.config.params.pulseTime === undefined && this.config.params.pulsetime !== undefined)
                ) {
                    const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    if (obj) {
                        // @ts-expect-error backwards compatibility
                        obj.native.params.pulseTime ||= this.config.params.pulsetime;
                        delete obj.native.params.pulsetime;
                        obj.native.params.host ||= this.config.params.bind;
                        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
                    }
                }
            },
        });
    }
}

// If started as allInOne mode => return function to create instance
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new ModbusAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new ModbusAdapter())();
}
