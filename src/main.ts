import ModbusTemplate from '@iobroker/modbus';
import type { AdapterOptions } from '@iobroker/adapter-core';

/** One read request of the device detection (template library) */
interface ReadRequest {
    registerType: 'holdingRegs' | 'inputRegs';
    address: number;
    len: number;
}

/** Result of one read: the 16-bit registers, or the error of the device */
interface ReadResult {
    registers?: number[];
    error?: string;
    exceptionCode?: number;
}

/** The part of the Modbus client of the running master, that the detection uses (read only) */
interface ReadClient {
    readHoldingRegisters(unitId: number, start: number, quantity: number): Promise<{ register: number[] }>;
    readInputRegisters(unitId: number, start: number, quantity: number): Promise<{ register: number[] }>;
}

const MAX_READS = 20;
const MAX_DETECT_TIME = 30_000;

export class ModbusAdapter extends ModbusTemplate {
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

    public override async processMessage(obj: ioBroker.Message): Promise<void> {
        if (obj?.command === 'readRegisters') {
            const result = await this.readRegistersForDetection(obj.message);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, result, obj.callback);
            }
            return;
        }
        return super.processMessage(obj);
    }

    /**
     * Device detection of the template library: reads a few registers over the connection of the running master.
     * Only function codes 3 and 4 are used, nothing is written.
     */
    private async readRegistersForDetection(
        message: ioBroker.Message['message'],
    ): Promise<{ results?: ReadResult[]; error?: string }> {
        const { reads, deviceId } = (message || {}) as { reads?: ReadRequest[]; deviceId?: number };
        if (!Array.isArray(reads) || !reads.length || reads.length > MAX_READS) {
            return { error: `Expected 1..${MAX_READS} reads` };
        }
        for (const r of reads) {
            if (
                (r?.registerType !== 'holdingRegs' && r?.registerType !== 'inputRegs') ||
                !Number.isInteger(r.address) ||
                r.address < 0 ||
                r.address > 65535 ||
                !Number.isInteger(r.len) ||
                r.len < 1 ||
                r.len > 125 ||
                r.address + r.len > 65536
            ) {
                return { error: `Invalid read request: ${JSON.stringify(r)}` };
            }
        }
        if (this.config.params.slave === '1' || (this.config.params.slave as unknown) === 1) {
            return { error: 'Device detection works only in master mode' };
        }
        // The client is not part of the public API of @iobroker/modbus, so check it carefully
        const master = this.modbus as unknown as { modbusClient?: ReadClient; connected?: boolean } | null;
        const client = master?.modbusClient;
        if (!client || typeof client.readHoldingRegisters !== 'function' || !master?.connected) {
            return { error: 'Not connected to the device' };
        }
        const unitId =
            Number.isInteger(deviceId) && deviceId! >= 0 && deviceId! <= 255
                ? deviceId!
                : parseInt(this.config.params.deviceId as unknown as string, 10) || 1;

        const started = Date.now();
        const results: ReadResult[] = [];
        // one after another: the client queues the requests anyway, and a slow device should not get a burst
        for (const r of reads) {
            if (Date.now() - started > MAX_DETECT_TIME) {
                results.push({ error: 'skipped (time limit)' });
                continue;
            }
            try {
                const response =
                    r.registerType === 'holdingRegs'
                        ? await client.readHoldingRegisters(unitId, r.address, r.len)
                        : await client.readInputRegisters(unitId, r.address, r.len);
                results.push({ registers: Array.from(response.register || []) });
            } catch (err) {
                const e = err as { message?: string; exceptionCode?: number };
                results.push({ error: e?.message || String(err), exceptionCode: e?.exceptionCode });
            }
        }
        this.log.info(
            `Device detection: ${reads.length} read(s) on unit ${unitId}, ${results.filter(r => r.registers).length} answered`,
        );
        return { results };
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
