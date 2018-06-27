'use strict';
const common = require(__dirname + '/common.js');
const fs = require('fs');
const Modbus = require('./jsmodbus');

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
    let objects     = options.objects;
    let device      = options.devices[Object.keys(options.devices)[0]];
    let modbusServer;
    let delayStart  = true;

    function getListOfClients(clients) {
        let list = [];
        for(let c in clients) {
            if (clients.hasOwnProperty(c)) {
                let address = clients[c].address().address;
                if (address) list.push(address);
            }
        }
        return list.join(',');
    }

    this.write = (id, state) => {
        if (objects[id].native.float === undefined) {
            objects[id].native.float =
                objects[id].native.type === 'floatle'  || objects[id].native.type === 'floatbe'  || objects[id].native.type === 'floatsw' ||
                objects[id].native.type === 'doublele' || objects[id].native.type === 'doublebe' || objects[id].native.type === 'floatsb';
        }
        let val;
        let buffer;
        let b;

        let t = typeof state.val;
        let type = objects[id].native.regType;
        let regs = options.devices[options.config.defaultDeviceId] && options.devices[options.config.defaultDeviceId][type];
        if (!regs) {
            adapter.log.error('Invalid type ' + type);
            return;
        }
        regs.changed = true;

        if (type === 'disInputs' || type === 'coils') {
            if (t === 'boolean' || t === 'number') {
                regs.values[objects[id].native.address - regs.addressLow] = state.val ? 1 : 0;
            } else {
                regs.values[objects[id].native.address - regs.addressLow] = parseInt(state.val, 10) ? 1 : 0;
            }
        } else if (type === 'inputRegs' || type === 'holdingRegs') {
            if (objects[id].native.type !== 'string') {
                if (t === 'boolean') {
                    val = state.val ? 1 : 0;
                } else if (t === 'number') {
                    val = state.val;
                } else {
                    val = parseFloat(state.val);
                }
                val = (val - objects[id].native.offset) / objects[id].native.factor;
                if (!objects[id].native.float) val = Math.round(val);
            } else {
                val = state.val;
            }
            buffer = common.writeValue(objects[id].native.type, val, objects[id].native.len);
            for (b = 0; b < buffer.length; b++) {
                regs.values[(objects[id].native.address - regs.addressLow) * 2 + b] = buffer[b];
            }
        } else {
            adapter.log.error('Unknown state "' + id + '" type: ' + objects[id].native.regType);
        }
    };

    this.start = () => {
        if (!delayStart && !modbusServer) {
            modbusServer = Modbus('server', 'tcp')({
                options: {
                    log:            adapter.log,
                    tcp: {
                        port:          parseInt(options.config.tcp.port, 10) || 502,
                        hostname:      options.config.tcp.bind || '127.0.0.1',
                    }
                },
                responseDelay: 100,
                coils:         new Buffer((device.coils.addressHigh      >> 3) + ((device.coils.addressHigh - 1)     % 8 ? 1 : 0)),
                discrete:      new Buffer((device.disInputs.addressHigh  >> 3) + ((device.disInputs.addressHigh - 1) % 8 ? 1 : 0)),
                input:         new Buffer(device.inputRegs.addressHigh   * 2),
                holding:       new Buffer(device.holdingRegs.addressHigh * 2)
            });

            modbusServer.on('readCoilsRequest', function (start, quantity) {
                let regs = device.coils;
                if (regs.changed) {
                    regs.changed = false;
                    let resp = new Array(Math.ceil(quantity / 16) * 2);
                    let i = 0;
                    let data = this.getCoils();
                    let j;
                    for (j = 0; j < resp.length && start + j < data.byteLength; j++) {
                        resp[j] = data.readUInt8(start + j);
                    }
                    for (; j < resp.length; j++) {
                        resp[j] = 0;
                    }

                    while (i < quantity && i + start < regs.addressHigh) {
                        if (regs.values[i + start - regs.addressLow]) {
                            resp[Math.floor(i / 8)] |= 1 << (i % 8);
                        } else {
                            resp[Math.floor(i / 8)] &= ~(1 << (i % 8));
                        }
                        i++;
                    }
                    let len = data.length;
                    for (i = 0; i < resp.length; i++) {
                        if (start + i >= len) break;
                        data.writeUInt8(resp[i], start + i);
                    }
                }
            });

            modbusServer.on('readDiscreteInputsRequest', function (start, quantity) {
                let regs = device.disInputs;
                if (regs.changed) {
                    // todo: there is a problem if master asked 8 bits and nothing was changed,
                    // then master asks 16 bits, higher 8 bits will not be delivered
                    regs.changed = false;
                    let resp = new Array(Math.ceil(quantity / 16) * 2);
                    let i = 0;
                    let data = this.getDiscrete();
                    let j;
                    for (j = 0; j < resp.length && start + j < data.byteLength; j++) {
                        resp[j] = data.readUInt8(start + j);
                    }
                    for (; j < resp.length; j++) {
                        resp[j] = 0;
                    }
                    while (i < quantity && i + start < regs.addressHigh) {
                        if (regs.values[i + start - regs.addressLow]) {
                            resp[Math.floor(i / 8)] |= 1 << (i % 8);
                        } else {
                            resp[Math.floor(i / 8)] &= ~(1 << (i % 8));
                        }
                        i++;
                    }
                    let len = data.length;
                    for (i = 0; i < resp.length; i++) {
                        if (start + i >= len) break;
                        data.writeUInt8(resp[i], start + i);
                    }
                }
            });

            modbusServer.on('readInputRegistersRequest', function (start, quantity) {
                let regs = device.inputRegs;
                if (regs.changed) {
                    regs.changed = false;
                    let   data = this.getInput();
                    const end  = start + quantity * 2;
                    const low  = regs.addressLow  * 2;
                    const high = regs.addressHigh * 2;
                    for (let i = start; i < end; i++) {
                        if (i >= data.length) break;
                        if (i >= low && i < high) {
                            data.writeUInt8(regs.values[i - low], i);
                        } else {
                            data.writeUInt8(0, i);
                        }
                    }
                }
            });

            modbusServer.on('readHoldingRegistersRequest', function (start, quantity) {
                let regs = device.holdingRegs;
                if (regs.changed) {
                    regs.changed = false;
                    let  data  = this.getHolding();
                    const end  = start + quantity * 2;
                    const low  = regs.addressLow  * 2;
                    const high = regs.addressHigh * 2;
                    for (let i = start; i < end; i++) {
                        if (i >= data.length) break;
                        if (i >= low && i < high) {
                            data.writeUInt8(regs.values[i - low], i);
                        } else {
                            data.writeUInt8(0, i);
                        }
                    }
                }
            });

            modbusServer.on('postWriteSingleCoilRequest', function (start, value) {
                let regs = device.coils;
                let a = start - regs.addressLow;

                if (a >= 0 && regs.mapping[a]) {
                    adapter.setState(regs.mapping[a], value, true, function (err) {
                        // analyse if the state could be set (because of permissions)
                        if (err) adapter.log.error('Can not set state: ' + err);
                    });
                    regs.values[a] = value;
                }
            });

            const mPow2 = [
                0x01,
                0x02,
                0x04,
                0x08,
                0x10,
                0x20,
                0x40,
                0x80
            ];

            modbusServer.on('postWriteMultipleCoilsRequest', function (start, length /* , byteLength*/) {
                let regs = device.coils;
                let i = 0;
                let data = this.getCoils();
                if (start < regs.addressLow) {
                    start = regs.addressLow;
                }

                while (i < length && i + start < regs.addressHigh) {
                    let a = i + start - regs.addressLow;
                    if (a >= 0 && regs.mapping[a]) {
                        let value = data.readUInt8((i + start) >> 3);
                        value = value & mPow2[(i + start) % 8];
                        adapter.setState(regs.mapping[a], !!value, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state: ' + err);
                        });
                        regs.values[a] = !!value;
                    }
                    i++;
                }
            });

            modbusServer.on('postWriteSingleRegisterRequest', function (start, value) {
                let regs = device.holdingRegs;
                start = start >> 1;
                let a = start - regs.addressLow;

                if (a >= 0 && regs.mapping[a]) {
                    let native = options.objects[regs.mapping[a]].native;
                    let buf = new Buffer(2);
                    buf.writeUInt16BE(value);
                    let val = common.extractValue(native.type, native.len, buf, 0);

                    if (native.type !== 'string') {
                        val = (val - native.offset) / native.factor;
                        val = Math.round(val * options.config.round) / options.config.round;
                    }

                    adapter.setState(regs.mapping[a], val, true, function (err) {
                        // analyse if the state could be set (because of permissions)
                        if (err) adapter.log.error('Can not set state: ' + err);
                    });

                    regs.values[a]     = buf[0];
                    regs.values[a + 1] = buf[1];
                }
            });

            modbusServer.on('postWriteMultipleRegistersRequest', function (start, length /* , byteLength*/) {
                let regs = device.holdingRegs;
                let data = this.getHolding();
                let i = 0;
                start = start >> 1;

                if (start < regs.addressLow) {
                    start = regs.addressLow;
                }

                while (i < length && i + start < regs.addressHigh) {
                    let a = i + start - regs.addressLow;
                    if (a >= 0 && regs.mapping[a]) {
                        let native = options.objects[regs.mapping[a]].native;

                        let val = common.extractValue(native.type, native.len, data, i + start);
                        if (native.type !== 'string') {
                            val = val * native.factor + native.offset;
                            val = Math.round(val * options.config.round) / options.config.round;
                        }
                        adapter.setState(regs.mapping[a], val, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state: ' + err);
                        });
                        for (let k = 0; k < native.len * 2; k++) {
                            regs.values[a * 2 + k] = data.readUInt8(start * 2 + k);
                        }
                        i += native.len;
                    } else {
                        i++;
                    }
                }
            });

            modbusServer.on('connection', client => {
                let list = getListOfClients(modbusServer.getClients());
                adapter.log.debug('+ Clients connected: ' + list);
                adapter.setState('info.connection', list, true);
            }).on('close', client => {
                let list = getListOfClients(modbusServer.getClients());
                adapter.log.debug('- Client connected: ' + list);
                adapter.setState('info.connection', list, true);
            }).on('error', err => {
                let list = getListOfClients(modbusServer.getClients());
                adapter.log.info('- Clients connected: ' + list);
                adapter.setState('info.connection', list, true);
                adapter.log.warn('Error on connection: ' + JSON.stringify(err));
            });
        }
    };

    this.close = () => {
        if (modbusServer) {
            try {
                modbusServer.close();
            } catch (e) {

            }
            modbusServer = null;
        }
    };

    this._initValues = (states, regs) => {
        // build ready arrays
        for (let i = 0; regs.fullIds.length > i; i++) {
            let id = regs.fullIds[i];
            if (states[id] && states[id].val !== undefined) {
                this.write(id, states[id]);
            } else {
                adapter.setState(id, 0, true, err => {
                    // analyse if the state could be set (because of permissions)
                    if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
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
        // read all states
        adapter.getStates('*', (err, states) => {
            this._initValues(states, device.disInputs);
            this._initValues(states, device.coils);
            this._initValues(states, device.inputRegs);
            this._initValues(states, device.holdingRegs);
            callback();
        });
    };

    (function _constructor() {
        adapter.setState('info.connection', 0, true);

        this.initValues(() => {
            delayStart = false;
            adapter.log.debug('Slave ready to start');
            this.start();
        });
    }.bind(this))();
    
    return this;
}

module.exports = Slave;