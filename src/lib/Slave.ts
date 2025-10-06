import { extractValue, writeValue } from './common';
import ModbusServerSerial from './jsmodbus/transports/modbus-server-serial';
import ModbusServerTcp from './jsmodbus/transports/modbus-server-tcp';
import { createLoggingWrapper } from './loggingUtils';
import type { SlaveDevice, Options, DeviceSlaveOption, RegisterType } from '../types';

// expected
// let options =  {
//     config: {
//          round: 1,
//          tcp: {
//              port: 502
//          }
//     },
//     objects: {
//     }
//     coils: {
//         config: ...
//         changed: true,
//         addressHigh: 0,
//         addressLow: 0,
//         values: [],
//         mapping: {}
//     },
//     inputRegs: ...,
//     disInputs: ...,
//     holdingRegs: ...
// };

export default class Slave {
    private readonly objects: Options['objects'];
    private readonly device: SlaveDevice;
    private delayStart = true;
    private modbusServer: ModbusServerTcp | ModbusServerSerial | null = null;
    private adapter: ioBroker.Adapter;
    private options: Options;

    constructor(options: Options, adapter: ioBroker.Adapter) {
        this.objects = options.objects;
        this.device = options.devices[Object.keys(options.devices).map(id => parseInt(id, 10))[0]] as SlaveDevice;
        this.adapter = adapter;
        this.options = options;

        void adapter.setState('info.connection', '', true);

        // read all other states and set alive to false
        void adapter.getForeignStatesAsync(`${adapter.namespace}.info.clients.*`).then(async allStates => {
            for (const id in allStates) {
                if (allStates[id] && allStates[id].val) {
                    await adapter.setStateAsync(id, false, true);
                }
            }
        });

        void this.initValues().then(() => {
            this.delayStart = false;
            this.adapter.log.debug('Slave ready to start');
            this.start();
        });
    }

    write(id: string, state: ioBroker.State): Promise<void> {
        if (!this.objects[id] || !this.objects[id].native) {
            this.adapter.log.error(`Can not set state ${id}: unknown object`);
            return Promise.resolve();
        }

        if (this.objects[id].native.float === undefined) {
            this.objects[id].native.float =
                this.objects[id].native.type === 'floatle' ||
                this.objects[id].native.type === 'floatbe' ||
                this.objects[id].native.type === 'floatsw' ||
                this.objects[id].native.type === 'doublele' ||
                this.objects[id].native.type === 'doublebe' ||
                this.objects[id].native.type === 'floatsb';
        }
        let val;
        let buffer;
        let b;

        const t = typeof state.val;
        const type: RegisterType = this.objects[id].native.regType;
        if (!this.device?.[type]) {
            this.adapter.log.error(`Invalid type ${type}`);
            return Promise.resolve();
        }
        const regs = this.device[type];
        regs.changed = true;

        if (type === 'disInputs' || type === 'coils') {
            if (t === 'boolean' || t === 'number') {
                regs.values[this.objects[id].native.address - regs.addressLow] = state.val ? 1 : 0;
            } else {
                regs.values[this.objects[id].native.address - regs.addressLow] = parseInt(state.val as string, 10)
                    ? 1
                    : 0;
            }
        } else if (type === 'inputRegs' || type === 'holdingRegs') {
            if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(this.objects[id].native.type)) {
                if (t === 'boolean') {
                    val = state.val ? 1 : 0;
                } else if (t === 'number') {
                    val = state.val;
                } else {
                    val = parseFloat(state.val as string);
                }
                val = ((val as number) - this.objects[id].native.offset) / this.objects[id].native.factor;
                if (!this.objects[id].native.float) {
                    val = Math.round(val);
                }
            } else {
                val = state.val;
            }
            try {
                buffer = writeValue(this.objects[id].native.type, val as number, this.objects[id].native.len);
                for (b = 0; b < buffer.length; b++) {
                    regs.values[(this.objects[id].native.address - regs.addressLow) * 2 + b] = buffer[b];
                }
            } catch (err) {
                this.adapter.log.warn(`Can not write value ${val}: ${err}`);
            }
        } else {
            this.adapter.log.error(`Unknown state "${id}" type: ${this.objects[id].native.regType}`);
        }
        return Promise.resolve();
    }

    start(): void {
        if (this.device && !this.delayStart && !this.modbusServer) {
            // this.device.coils ||= {
            //     addressHigh: 8,
            // };
            // this.device.disInputs ||= { addressHigh: 8 };
            // this.device.inputRegs ||= { addressHigh: 1 };
            // this.device.holdingRegs ||= { addressHigh: 1 };
            const logWrapper = createLoggingWrapper(this.adapter.log, this.options.config.disableLogging);

            if (this.options.config.type === 'serial') {
                if (!this.options.config.serial) {
                    throw new Error('Serial is required');
                }

                this.modbusServer = new ModbusServerSerial({
                    logger: logWrapper,
                    serial: {
                        portName: this.options.config.serial.comName,
                        baudRate: this.options.config.serial.baudRate || 9600,
                        dataBits: this.options.config.serial.dataBits || 8,
                        stopBits: this.options.config.serial.stopBits || 1,
                        parity: this.options.config.serial.parity || 'none',
                    },
                    deviceId: this.options.config.defaultDeviceId,
                    responseDelay: 100,
                    coils: Buffer.alloc(
                        (this.device.coils.addressHigh >> 3) + ((this.device.coils.addressHigh - 1) % 8 ? 1 : 0),
                    ),
                    discrete: Buffer.alloc(
                        (this.device.disInputs.addressHigh >> 3) +
                            ((this.device.disInputs.addressHigh - 1) % 8 ? 1 : 0),
                    ),
                    input: Buffer.alloc(this.device.inputRegs.addressHigh * 2),
                    holding: Buffer.alloc(this.device.holdingRegs.addressHigh * 2),
                });
            } else {
                if (!this.options.config.tcp) {
                    throw new Error('TCP options is required');
                }
                this.modbusServer = new ModbusServerTcp({
                    logger: logWrapper,
                    tcp: {
                        port: this.options.config.tcp.port || 502,
                        hostname: this.options.config.tcp.bind || '127.0.0.1',
                    },
                    responseDelay: 100,
                    coils: Buffer.alloc(
                        (this.device.coils.addressHigh >> 3) + ((this.device.coils.addressHigh - 1) % 8 ? 1 : 0),
                    ),
                    discrete: Buffer.alloc(
                        (this.device.disInputs.addressHigh >> 3) +
                            ((this.device.disInputs.addressHigh - 1) % 8 ? 1 : 0),
                    ),
                    input: Buffer.alloc(this.device.inputRegs.addressHigh * 2),
                    holding: Buffer.alloc(this.device.holdingRegs.addressHigh * 2),
                });
            }

            this.modbusServer.on('readCoilsRequest', (start: number, quantity: number): void => {
                const regs = this.device.coils;
                if (
                    regs.changed ||
                    regs.lastEnd === undefined ||
                    regs.lastStart! > start ||
                    regs.lastEnd < start + quantity
                ) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const resp = new Array(Math.ceil(quantity / 16) * 2);
                    let i = 0;
                    const data = this.modbusServer?.getCoils();
                    if (!data) {
                        return;
                    }
                    let j;
                    for (j = 0; j < resp.length && start + j < data.byteLength; j++) {
                        resp[j] = data.readUInt8(start + j);
                    }
                    for (; j < resp.length; j++) {
                        resp[j] = 0;
                    }

                    while (i < quantity && i + start < regs.addressHigh) {
                        if (regs.values[i + start - regs.addressLow]) {
                            resp[Math.floor(i / 8)] |= 1 << i % 8;
                        } else {
                            resp[Math.floor(i / 8)] &= ~(1 << i % 8);
                        }
                        i++;
                    }
                    const len = data.length;
                    for (i = 0; i < resp.length; i++) {
                        if (start + i >= len) {
                            break;
                        }
                        data.writeUInt8(resp[i], start + i);
                    }
                }
            });

            this.modbusServer.on('readDiscreteInputsRequest', (start: number, quantity: number): void => {
                const regs = this.device.disInputs;
                if (
                    regs.changed ||
                    regs.lastEnd === undefined ||
                    regs.lastStart! > start ||
                    regs.lastEnd < start + quantity
                ) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const resp = new Array(Math.ceil(quantity / 16) * 2);
                    let i = 0;
                    const data = this.modbusServer?.getDiscrete();
                    if (!data) {
                        return;
                    }
                    let j;
                    for (j = 0; j < resp.length && start + j < data.byteLength; j++) {
                        resp[j] = data.readUInt8(start + j);
                    }
                    for (; j < resp.length; j++) {
                        resp[j] = 0;
                    }
                    while (i < quantity && i + start < regs.addressHigh) {
                        if (regs.values[i + start - regs.addressLow]) {
                            resp[Math.floor(i / 8)] |= 1 << i % 8;
                        } else {
                            resp[Math.floor(i / 8)] &= ~(1 << i % 8);
                        }
                        i++;
                    }
                    const len = data.length;
                    for (i = 0; i < resp.length; i++) {
                        if (start + i >= len) {
                            break;
                        }
                        data.writeUInt8(resp[i], start + i);
                    }
                }
            });

            // let "function" here and not use =>
            this.modbusServer.on('readInputRegistersRequest', (start: number, quantity: number): void => {
                const regs = this.device.inputRegs;
                if (
                    regs.changed ||
                    regs.lastEnd === undefined ||
                    regs.lastStart! > start ||
                    regs.lastEnd < start + quantity
                ) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const data = this.modbusServer?.getInput();
                    if (!data) {
                        return;
                    }
                    const end = start + quantity * 2;
                    const low = regs.addressLow * 2;
                    const high = regs.addressHigh * 2;
                    for (let i = start; i < end; i++) {
                        if (i >= data.length) {
                            break;
                        }
                        if (i >= low && i < high) {
                            data.writeUInt8(regs.values[i - low] as number, i);
                        } else {
                            data.writeUInt8(0, i);
                        }
                    }
                }
            });

            // let "function" here and not use =>
            this.modbusServer.on('readHoldingRegistersRequest', (start: number, quantity: number): void => {
                const regs = this.device.holdingRegs;
                if (
                    regs.changed ||
                    regs.lastEnd === undefined ||
                    regs.lastStart! > start ||
                    regs.lastEnd < start + quantity
                ) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const data = this.modbusServer?.getHolding();
                    if (!data) {
                        return;
                    }
                    const end = start + quantity * 2;
                    const low = regs.addressLow * 2;
                    const high = regs.addressHigh * 2;
                    for (let i = start; i < end; i++) {
                        if (i >= data.length) {
                            break;
                        }
                        if (i >= low && i < high) {
                            data.writeUInt8(regs.values[i - low] as number, i);
                        } else {
                            data.writeUInt8(0, i);
                        }
                    }
                }
            });

            this.modbusServer.on('postWriteSingleCoilRequest', (start: number, value: boolean): void => {
                const regs = this.device.coils;
                const a = start - regs.addressLow;

                if (a >= 0 && regs.mapping[a]) {
                    void this.adapter.setState(
                        regs.mapping[a],
                        value,
                        true,
                        err =>
                            // analyse if the state could be set (because of permissions)
                            err && this.adapter.log.error(`Can not set state: ${err.message}`),
                    );
                    regs.values[a] = value;
                }
            });

            const mPow2 = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

            this.modbusServer.on('postWriteMultipleCoilsRequest', (start: number, length: number): void => {
                const regs = this.device.coils;
                let i = 0;
                const data = this.modbusServer?.getCoils();
                if (!data) {
                    return;
                }
                if (start < regs.addressLow) {
                    start = regs.addressLow;
                }

                while (i < length && i + start < regs.addressHigh) {
                    const a = i + start - regs.addressLow;
                    if (a >= 0 && regs.mapping[a]) {
                        let value = data.readUInt8((i + start) >> 3);
                        value = value & mPow2[(i + start) % 8];
                        void this.adapter.setState(
                            regs.mapping[a],
                            !!value,
                            true,
                            err =>
                                // analyse if the state could be set (because of permissions)
                                err && this.adapter.log.error(`Can not set state: ${err.message}`),
                        );

                        regs.values[a] = !!value;
                    }
                    i++;
                }
            });

            this.modbusServer.on('postWriteSingleRegisterRequest', (start: number, value: number): void => {
                const regs = this.device.holdingRegs;
                start = start >> 1;
                const a = start - regs.addressLow;

                if (a >= 0 && regs.mapping[a]) {
                    const native = this.options.objects[regs.mapping[a]]?.native;
                    if (!native) {
                        return;
                    }
                    const buf = Buffer.alloc(2);
                    buf.writeUInt16BE(value);
                    try {
                        let val = extractValue(native.type, native.len, buf, 0);

                        if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(native.type)) {
                            val = ((val as number) - native.offset) / native.factor;
                            val = Math.round(val * this.options.config.round) / this.options.config.round;
                        }

                        void this.adapter.setState(
                            regs.mapping[a],
                            val,
                            true,
                            err =>
                                // analyse if the state could be set (because of permissions)
                                err && this.adapter.log.error(`Can not set state: ${err.message}`),
                        );
                    } catch (err) {
                        this.adapter.log.error(`Can not set value: ${err.message}`);
                    }

                    regs.values[a] = buf[0];
                    regs.values[a + 1] = buf[1];
                }
            });

            this.modbusServer.on('postWriteMultipleRegistersRequest', (start: number, length: number): void => {
                const regs = this.device.holdingRegs;
                const data = this.modbusServer?.getHolding();
                let i = 0;
                start = start >> 1;

                if (start < regs.addressLow) {
                    start = regs.addressLow;
                }

                while (data && i < length && i + start < regs.addressHigh) {
                    const a = i + start - regs.addressLow;
                    if (a >= 0 && regs.mapping[a]) {
                        const obj = this.options.objects[regs.mapping[a]];
                        if (!obj?.native) {
                            continue;
                        }
                        const native = obj.native;

                        try {
                            let val = extractValue(native.type, native.len, data, i + start);
                            if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(native.type)) {
                                val = (val as number) * native.factor + native.offset;
                                val =
                                    Math.round((val as number) * this.options.config.round) / this.options.config.round;
                            }
                            void this.adapter.setState(
                                regs.mapping[a],
                                val,
                                true,
                                err =>
                                    // analyze if the state could be set (because of permissions)
                                    err && this.adapter.log.error(`Can not set state: ${err.message}`),
                            );
                        } catch (err) {
                            this.adapter.log.error(`Can not set value: ${err.message}`);
                        }

                        for (let k = 0; k < native.len * 2; k++) {
                            regs.values[a * 2 + k] = data.readUInt8(start * 2 + k);
                        }
                        i += native.len;
                    } else {
                        i++;
                    }
                }
            });

            this.modbusServer
                .on('connection', async () => {
                    if (this.modbusServer) {
                        const list = this.modbusServer.getClients();
                        const clientIds = list.map(e => e.trim().replace(/\./g, '_'));
                        const allStates = await this.adapter.getStatesAsync('info.clients.*');
                        const ids = Object.keys(allStates).map(e => e.split('.').pop());
                        for (let i = 0; i < clientIds.length; i++) {
                            if (ids.includes(clientIds[i])) {
                                await this.adapter.setStateAsync(`info.clients.${clientIds[i]}`, true, true);
                            } else {
                                await this.adapter.setObjectAsync(`info.clients.${clientIds[i]}`, {
                                    type: 'state',
                                    common: {
                                        name: clientIds[i].replace(/_/g, '.'),
                                        type: 'boolean',
                                        role: 'indicator.reachable',
                                        read: true,
                                        write: false,
                                    },
                                    native: {
                                        ip: clientIds[i].replace(/_/g, '.'),
                                    },
                                });
                                await this.adapter.setStateAsync(`info.clients.${clientIds[i]}`, true, true);
                            }
                        }

                        this.adapter.log.debug(`+ Clients connected: ${list.join(', ')}`);
                        void this.adapter.setState('info.connection', list.join(','), true);
                    } else {
                        void this.adapter.setState('info.connection', '', true);
                    }
                })
                .on('close', async () => {
                    const list = this.modbusServer?.getClients();
                    if (list) {
                        this.adapter.log.debug(`- Client connected: ${list.join(', ')}`);
                    }

                    const clientIds = list?.map(e => e.trim().replace(/\./g, '_')) || [];
                    // read all other states and set alive to false
                    const allStates = await this.adapter.getStatesAsync('info.clients.*');
                    const allIds = Object.keys(allStates);
                    for (const id of allIds) {
                        if (!clientIds.includes(id.split('.').pop()!)) {
                            await this.adapter.setStateAsync(id, false, true);
                        }
                    }

                    void this.adapter.setState('info.connection', list ? list.join(',') : '', true);
                })
                .on('error', async err => {
                    const list = this.modbusServer?.getClients();
                    if (list) {
                        this.adapter.log.info(`- Clients connected: ${list.join(', ')}`);
                    }

                    const clientIds = list?.map(e => e.trim().replace(/\./g, '_')) || [];
                    // read all other states and set alive to false
                    const allStates = await this.adapter.getStatesAsync('info.clients.*');
                    const allIds = Object.keys(allStates);
                    for (const id of allIds) {
                        if (!clientIds.includes(id.split('.').pop()!)) {
                            await this.adapter.setStateAsync(id, false, true);
                        }
                    }

                    void this.adapter.setState('info.connection', list ? list.join(',') : '', true);
                    this.adapter.log.warn(`Error on connection: ${JSON.stringify(err)}`);
                });
        }
    }

    close(cb?: () => void): void {
        if (this.modbusServer) {
            try {
                this.modbusServer.close(cb);
            } catch {
                // empty
            }
            this.modbusServer = null;
        }
    }

    #initValues(states: { [id: string]: ioBroker.State }, regs: DeviceSlaveOption): void {
        if (!states) {
            return;
        }
        // build ready arrays
        for (let i = 0; regs.fullIds.length > i; i++) {
            const id = regs.fullIds[i];
            if (states[id]?.val !== undefined) {
                this.write(id, states[id]).catch(e => this.adapter.log.error(`Cannot write state ${id}: ${e.message}`));
            } else {
                void this.adapter.setState(id, 0, true, err => {
                    // analyse if the state could be set (because of permissions)
                    if (err) {
                        this.adapter.log.error(`Can not set state ${id}: ${err.message}`);
                    }
                });
            }
        }

        // fill with 0 empty values
        for (let i = 0; i < regs.values.length; i++) {
            if (regs.values[i] === undefined || regs.values[i] === null) {
                regs.values[i] = 0;
            } else if (typeof regs.values[i] === 'boolean') {
                regs.values[i] = regs.values[i] ? 1 : 0;
            } else if (typeof regs.values[i] !== 'number') {
                regs.values[i] = parseInt(regs.values[i] as unknown as string, 10) ? 1 : 0;
            }
        }
    }

    async initValues(): Promise<void> {
        if (!this.device) {
            return;
        }
        // read all states
        const states = await this.adapter.getStatesAsync('*');
        this.#initValues(states, this.device.disInputs);
        this.#initValues(states, this.device.coils);
        this.#initValues(states, this.device.inputRegs);
        this.#initValues(states, this.device.holdingRegs);
    }
}
