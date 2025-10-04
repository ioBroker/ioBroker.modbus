'use strict';
const common = require('./common.ts');
const Modbus = require('./jsmodbus');
const { createLoggingWrapper } = require('./loggingUtils');

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

function Slave(options, adapter) {
    const objects = options.objects;
    const device = options.devices[Object.keys(options.devices)[0]];
    let delayStart = true;
    let modbusServer;

    function getListOfClients(clients) {
        const list = [];
        for (const c in clients) {
            if (Object.hasOwnProperty.call(clients, c)) {
                const address = clients[c].address().address;
                address && list.push(address);
            }
        }
        return list.join(',');
    }

    this.write = (id, state) => {
        if (!objects[id] || !objects[id].native) {
            return adapter.log.error(`Can not set state ${id}: unknown object`);
        }

        if (objects[id].native.float === undefined) {
            objects[id].native.float =
                objects[id].native.type === 'floatle' ||
                objects[id].native.type === 'floatbe' ||
                objects[id].native.type === 'floatsw' ||
                objects[id].native.type === 'doublele' ||
                objects[id].native.type === 'doublebe' ||
                objects[id].native.type === 'floatsb';
        }
        let val;
        let buffer;
        let b;

        const t = typeof state.val;
        const type = objects[id].native.regType;
        if (!device || !device[type]) {
            return adapter.log.error(`Invalid type ${type}`);
        }
        const regs = device[type];
        regs.changed = true;

        if (type === 'disInputs' || type === 'coils') {
            if (t === 'boolean' || t === 'number') {
                regs.values[objects[id].native.address - regs.addressLow] = state.val ? 1 : 0;
            } else {
                regs.values[objects[id].native.address - regs.addressLow] = parseInt(state.val, 10) ? 1 : 0;
            }
        } else if (type === 'inputRegs' || type === 'holdingRegs') {
            if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(objects[id].native.type)) {
                if (t === 'boolean') {
                    val = state.val ? 1 : 0;
                } else if (t === 'number') {
                    val = state.val;
                } else {
                    val = parseFloat(state.val);
                }
                val = (val - objects[id].native.offset) / objects[id].native.factor;
                if (!objects[id].native.float) {
                    val = Math.round(val);
                }
            } else {
                val = state.val;
            }
            try {
                buffer = common.writeValue(objects[id].native.type, val, objects[id].native.len);
                for (b = 0; b < buffer.length; b++) {
                    regs.values[(objects[id].native.address - regs.addressLow) * 2 + b] = buffer[b];
                }
            } catch (err) {
                adapter.log.warn(`Can not write value ${val}: ${err}`);
            }
        } else {
            adapter.log.error(`Unknown state "${id}" type: ${objects[id].native.regType}`);
        }
    };

    this.start = () => {
        if (device && !delayStart && !modbusServer) {
            device.coils = device.coils || { addressHigh: 8 };
            device.disInputs = device.disInputs || { addressHigh: 8 };
            device.addressHigh = device.addressHigh || { addressHigh: 1 };
            device.holdingRegs = device.holdingRegs || { addressHigh: 1 };

            const logWrapper = createLoggingWrapper(adapter.log, options.config.disableLogging);

            // Determine transport type - default to 'tcp' for backwards compatibility
            let transportType = 'tcp';
            let transportOptions = {};

            if (options.config.type === 'serial') {
                transportType = 'serial';
                transportOptions = {
                    log: logWrapper,
                    serial: {
                        portName: options.config.serial.comName,
                        baudRate: parseInt(options.config.serial.baudRate, 10) || 9600,
                        dataBits: parseInt(options.config.serial.dataBits, 10) || 8,
                        stopBits: parseInt(options.config.serial.stopBits, 10) || 1,
                        parity: options.config.serial.parity || 'none',
                    },
                    deviceId: options.config.defaultDeviceId,
                };
            } else {
                transportOptions = {
                    log: logWrapper,
                    tcp: {
                        port: parseInt(options.config.tcp.port, 10) || 502,
                        hostname: options.config.tcp.bind || '127.0.0.1',
                    },
                };
            }

            modbusServer = Modbus(
                'server',
                transportType,
            )({
                options: transportOptions,
                responseDelay: 100,
                coils: Buffer.alloc((device.coils.addressHigh >> 3) + ((device.coils.addressHigh - 1) % 8 ? 1 : 0)),
                discrete: Buffer.alloc(
                    (device.disInputs.addressHigh >> 3) + ((device.disInputs.addressHigh - 1) % 8 ? 1 : 0),
                ),
                input: Buffer.alloc(device.inputRegs.addressHigh * 2),
                holding: Buffer.alloc(device.holdingRegs.addressHigh * 2),
            });

            // let "function" here and not use =>
            modbusServer.on('readCoilsRequest', function (start, quantity) {
                const regs = device.coils;
                if (regs.changed || regs.lastStart > start || regs.lastEnd < start + quantity) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const resp = new Array(Math.ceil(quantity / 16) * 2);
                    let i = 0;
                    const data = this.getCoils();
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
            modbusServer.on('readDiscreteInputsRequest', function (start, quantity) {
                const regs = device.disInputs;
                if (regs.changed || regs.lastStart > start || regs.lastEnd < start + quantity) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const resp = new Array(Math.ceil(quantity / 16) * 2);
                    let i = 0;
                    const data = this.getDiscrete();
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
            modbusServer.on('readInputRegistersRequest', function (start, quantity) {
                const regs = device.inputRegs;
                if (regs.changed || regs.lastStart > start || regs.lastEnd < start + quantity) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const data = this.getInput();
                    const end = start + quantity * 2;
                    const low = regs.addressLow * 2;
                    const high = regs.addressHigh * 2;
                    for (let i = start; i < end; i++) {
                        if (i >= data.length) {
                            break;
                        }
                        if (i >= low && i < high) {
                            data.writeUInt8(regs.values[i - low], i);
                        } else {
                            data.writeUInt8(0, i);
                        }
                    }
                }
            });

            // let "function" here and not use =>
            modbusServer.on('readHoldingRegistersRequest', function (start, quantity) {
                const regs = device.holdingRegs;
                if (regs.changed || regs.lastStart > start || regs.lastEnd < start + quantity) {
                    regs.lastStart = start;
                    regs.lastEnd = start + quantity;
                    regs.changed = false;
                    const data = this.getHolding();
                    const end = start + quantity * 2;
                    const low = regs.addressLow * 2;
                    const high = regs.addressHigh * 2;
                    for (let i = start; i < end; i++) {
                        if (i >= data.length) {
                            break;
                        }
                        if (i >= low && i < high) {
                            data.writeUInt8(regs.values[i - low], i);
                        } else {
                            data.writeUInt8(0, i);
                        }
                    }
                }
            });

            modbusServer.on('postWriteSingleCoilRequest', function (start, value) {
                const regs = device.coils;
                const a = start - regs.addressLow;

                if (a >= 0 && regs.mapping[a]) {
                    adapter.setState(
                        regs.mapping[a],
                        value,
                        true,
                        err =>
                            // analyse if the state could be set (because of permissions)
                            err && adapter.log.error(`Can not set state: ${err.message}`),
                    );
                    regs.values[a] = value;
                }
            });

            const mPow2 = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

            // let "function" here and not use =>
            modbusServer.on('postWriteMultipleCoilsRequest', function (start, length /* , byteLength*/) {
                const regs = device.coils;
                let i = 0;
                const data = this.getCoils();
                if (start < regs.addressLow) {
                    start = regs.addressLow;
                }

                while (i < length && i + start < regs.addressHigh) {
                    const a = i + start - regs.addressLow;
                    if (a >= 0 && regs.mapping[a]) {
                        let value = data.readUInt8((i + start) >> 3);
                        value = value & mPow2[(i + start) % 8];
                        adapter.setState(
                            regs.mapping[a],
                            !!value,
                            true,
                            err =>
                                // analyse if the state could be set (because of permissions)
                                err && adapter.log.error(`Can not set state: ${err.message}`),
                        );

                        regs.values[a] = !!value;
                    }
                    i++;
                }
            });

            modbusServer.on('postWriteSingleRegisterRequest', function (start, value) {
                const regs = device.holdingRegs;
                start = start >> 1;
                const a = start - regs.addressLow;

                if (a >= 0 && regs.mapping[a]) {
                    const native = options.objects[regs.mapping[a]].native;
                    const buf = Buffer.alloc(2);
                    buf.writeUInt16BE(value);
                    try {
                        let val = common.extractValue(native.type, native.len, buf, 0);

                        if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(native.type)) {
                            val = (val - native.offset) / native.factor;
                            val = Math.round(val * options.config.round) / options.config.round;
                        }

                        adapter.setState(
                            regs.mapping[a],
                            val,
                            true,
                            err =>
                                // analyse if the state could be set (because of permissions)
                                err && adapter.log.error(`Can not set state: ${err.message}`),
                        );
                    } catch (err) {
                        adapter.log.error(`Can not set value: ${err.message}`);
                    }

                    regs.values[a] = buf[0];
                    regs.values[a + 1] = buf[1];
                }
            });

            // let "function" here and not use =>
            modbusServer.on('postWriteMultipleRegistersRequest', function (start, length /* , byteLength*/) {
                const regs = device.holdingRegs;
                const data = this.getHolding();
                let i = 0;
                start = start >> 1;

                if (start < regs.addressLow) {
                    start = regs.addressLow;
                }

                while (i < length && i + start < regs.addressHigh) {
                    const a = i + start - regs.addressLow;
                    if (a >= 0 && regs.mapping[a]) {
                        const native = options.objects[regs.mapping[a]].native;

                        try {
                            let val = common.extractValue(native.type, native.len, data, i + start);
                            if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(native.type)) {
                                val = val * native.factor + native.offset;
                                val = Math.round(val * options.config.round) / options.config.round;
                            }
                            adapter.setState(
                                regs.mapping[a],
                                val,
                                true,
                                err =>
                                    // analyze if the state could be set (because of permissions)
                                    err && adapter.log.error(`Can not set state: ${err.message}`),
                            );
                        } catch (err) {
                            adapter.log.error(`Can not set value: ${err.message}`);
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

            modbusServer
                .on('connection', async () => {
                    let list = '';
                    if (modbusServer) {
                        list = getListOfClients(modbusServer.getClients());
                        const clientIds = list.split(',').map(e => e.trim().replace(/\./g, '_'));
                        const allStates = await adapter.getStatesAsync('info.clients.*');
                        const ids = Object.keys(allStates).map(e => e.split('.').pop());
                        for (let i = 0; i < clientIds.length; i++) {
                            if (ids.includes(clientIds[i])) {
                                await adapter.setStateAsync(`info.clients.${clientIds[i]}`, true, true);
                            } else {
                                await adapter.setObjectAsync(`info.clients.${clientIds[i]}`, {
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
                                await adapter.setStateAsync(`info.clients.${clientIds[i]}`, true, true);
                            }
                        }

                        adapter.log.debug(`+ Clients connected: ${list}`);
                    }
                    adapter.setState('info.connection', list, true);
                })
                .on('close', async () => {
                    let list = '';
                    if (modbusServer) {
                        list = getListOfClients(modbusServer.getClients());
                        adapter.log.debug(`- Client connected: ${list}`);
                    }

                    const clientIds = list.split(',').map(e => e.trim().replace(/\./g, '_'));
                    // read all other states and set alive to false
                    const allStates = await adapter.getStatesAsync('info.clients.*');
                    for (const id in allStates) {
                        if (!clientIds.includes(id.split('.').pop())) {
                            await adapter.setStateAsync(id, false, true);
                        }
                    }

                    adapter.setState('info.connection', list, true);
                })
                .on('error', async err => {
                    let list = '';
                    if (modbusServer) {
                        list = getListOfClients(modbusServer.getClients());
                        adapter.log.info(`- Clients connected: ${list}`);
                    }

                    const clientIds = list.split(',').map(e => e.trim().replace(/\./g, '_'));
                    // read all other states and set alive to false
                    const allStates = await adapter.getStatesAsync('info.clients.*');
                    for (const id in allStates) {
                        if (!clientIds.includes(id.split('.').pop())) {
                            await adapter.setStateAsync(id, false, true);
                        }
                    }

                    adapter.setState('info.connection', list, true);
                    adapter.log.warn(`Error on connection: ${JSON.stringify(err)}`);
                });
        }
    };

    this.close = () => {
        if (modbusServer) {
            try {
                modbusServer.close();
            } catch {
                // empty
            }
            modbusServer = null;
        }
    };

    this._initValues = (states, regs) => {
        if (!states) {
            return;
        }
        // build ready arrays
        for (let i = 0; regs.fullIds.length > i; i++) {
            const id = regs.fullIds[i];
            if (states[id] && states[id].val !== undefined) {
                this.write(id, states[id]);
            } else {
                adapter.setState(id, 0, true, err => {
                    // analyse if the state could be set (because of permissions)
                    if (err) {
                        adapter.log.error(`Can not set state ${id}: ${err.message}`);
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
                regs.values[i] = parseInt(regs.values[i], 10) ? 1 : 0;
            }
        }
    };

    this.initValues = callback => {
        if (!device) {
            return void callback();
        }
        // read all states
        adapter.getStates('*', (err, states) => {
            if (err) {
                return callback();
            }
            this._initValues(states, device.disInputs);
            this._initValues(states, device.coils);
            this._initValues(states, device.inputRegs);
            this._initValues(states, device.holdingRegs);
            callback();
        });
    };

    (function _constructor() {
        adapter.setState('info.connection', '', true);

        // read all other states and set alive to false
        adapter.getForeignStatesAsync(`${adapter.namespace}.info.clients.*`).then(async allStates => {
            for (const id in allStates) {
                if (allStates[id] && allStates[id].val) {
                    await adapter.setStateAsync(id, false, true);
                }
            }
        });

        this.initValues(() => {
            delayStart = false;
            adapter.log.debug('Slave ready to start');
            this.start();
        });
    }).bind(this)();

    return this;
}

module.exports = Slave;
