'use strict';
const common = require(__dirname + '/common.js');
const fs = require('fs');
const Modbus = require('./jsmodbus');
// expected
// let options =  {
//     config: {
//          type: 'tcp',
//          recon:
//          timeout:
//          pulsetime:
//          poll:
//          defaultDeviceId: 0,
//          tcp: {  // only if type="tcp" or type="tcprtu"
//              bind: '0.0.0.0', 
//              port: 502,       
//          },
//          serial: {   // only if type="serial"
//              comName: 'tty',
//              parity:
//              dataBits:
//              stopBits
//              baudRate
//          },
//          maxBlock
//     },
//     objects: {
//     }
//     coils: {
//         addressLow: 0,
//         length: 1000,
//         config: []
//         blocks: {},
//         cyclicWrite // only holdingRegs
//     },
//     inputRegs: ...,
//     disInputs: ...,
//     holdingRegs: ...
// };


function Master(options, adapter) {
    let modbusClient;
    let connected;
    let connectTimer;
    let nextPoll;
    let pollTime;
    let errorCount = 0;
    let ackObjects      = {};
    let objects         = options.objects;
    let isStop          = false;
    let pulseList       = {};
    let sendBuffer      = {};
    let devices         = options.devices;
    let deviceIds       = Object.keys(devices);

    function reconnect(isImmediately) {
        if (nextPoll) {
            clearTimeout(nextPoll);
            nextPoll = null;
        }

        try {
            if (modbusClient) {
                modbusClient.close();
            }
        } catch (e) {
            adapter.log.error('Cannot close master: ' + e);
        }

        if (connected) {
            if (options.config.tcp) {
                adapter.log.info('Disconnected from slave ' + options.config.tcp.bind);
            } else {
                adapter.log.info('Disconnected from slave');
            }

            connected = false;
            adapter.setState('info.connection', false, true);
        }

        if (!connectTimer) {
            connectTimer = setTimeout(function () {
                connectTimer = null;
                modbusClient.connect();
            }, isImmediately ? 1000 : options.config.recon);
        }
    }


    function pollBinariesBlock(device, regType, func, block, callback) {
        let regs = device[regType];
        if (block >= regs.blocks.length) {
            return callback();
        }

        const regBlock = regs.blocks[block];

        if (regBlock.startIndex === regBlock.endIndex) {
            regBlock.endIndex++;
        }

        modbusClient[func](regs.deviceId, regBlock.start, regBlock.count).then(response => {
            if (response.data && response.data.length) {
                for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                    let id = regs.config[n].id;
                    let val = response.data[regs.config[n].address - regBlock.start];

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, !!val, true, err => {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
            } else {
                adapter.log.warn(`Null buffer length ${func} for ${regType} ${regBlock.start}`);
            }
            setImmediate(() => {
                pollBinariesBlock(device, regType, func, block + 1, callback);
            });
        }).catch(err => {
            callback(err);
        });
    }

    function pollBinariesBlocks(device, regType, func, callback) {
        let regs = device[regType];
        if (regs.length) {
            pollBinariesBlock(device, regType, func, 0, err => {
                callback(err);
            });
        } else {
            callback();
        }
    }

    function pollFloatBlock(device, regType, func, block, callback) {
        let regs = device[regType];

        if (block >= regs.blocks.length) {
            return callback();
        }

        const regBlock = regs.blocks[block];

        if (regBlock.startIndex === regBlock.endIndex) {
            regBlock.endIndex++;
        }

        modbusClient[func](regs.deviceId, regBlock.start, regBlock.count).then(response => {
            if (response.payload && response.payload.length) {
                for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                    let id = regs.config[n].id;
                    let val = common.extractValue(regs.config[n].type, regs.config[n].len, response.payload, regs.config[n].address - regBlock.start);
                    if (regs.config[n].type !== 'string') {
                        val = val * regs.config[n].factor + regs.config[n].offset;
                        val = Math.round(val * options.config.round) / options.config.round;
                    }
                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, val, true, err => {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error(`Can not set state ${id}: ${err}`);
                        });
                    }
                }
            } else {
                adapter.log.warn(`Null buffer length ${func} for ${regType} ${regBlock.start}`);
            }
            // special case
            if (options.config.maxBlock < 2 && regs.config[regBlock.startIndex].cw) {
                // write immediately the current value
                writeFloatsReg(device, regType, objects[regs.config[regBlock.startIndex].fullId], () => {
                    pollFloatBlock(device, regType, func, block + 1, callback);
                });
            } else {
                setImmediate(() => {
                    pollFloatBlock(device, regType, func, block + 1, callback);
                });
            }
        }).catch(err => {
            callback(err);
        });
    }

    function pollFloatsBlocks(device, regType, func, callback) {
        let regs = device[regType];
        if (regs.length) {
            pollFloatBlock(device, regType, func, 0, err => {
                if (regs.cyclicWrite && regs.cyclicWrite.length && options.config.maxBlock >= 2) {
                    writeFloatsRegs(device, regType, 0, callback);
                } else {
                    callback(err);
                }
            });
        } else {
            callback();
        }
    }

    function writeFloatsReg(device, regType, obj, callback) {
        let regs = device[regType];
        if (obj.native.len > 1) {
            let buffer = new Buffer(obj.native.len * 2);
            for (let b = 0; b < buffer.length; b++) {
                buffer[b] = regs.config[(obj.native.address - regs.addressLow) * 2 + b];
            }
            modbusClient.writeMultipleRegisters(regs.deviceId, obj.native.address, buffer)
                .then(response => callback())
                .catch(err => {
                    adapter.log.error('Cannot write: ' + JSON.stringify(err));
                    callback(err);
                });
        } else {
            callback();
        }
    }

    function writeFloatsRegs(device, regType, i, callback) {
        let regs = device[regType];

        if (i >= regs.cyclicWrite.length) {
            return callback();
        }

        let id = regs.cyclicWrite[i];

        writeFloatsReg(device, regType, objects[id], () => {
            writeFloatsRegs(device, regType, i + 1, callback);
        });
    }

    function pollResult(startTime, err, cb) {
        if (err) {
            errorCount++;

            adapter.log.warn('Poll error count: ' + errorCount + ' code: ' + JSON.stringify(err));
            adapter.setState('info.connection', false, true);

            if (errorCount > 12 * deviceIds.length) { // 2 reconnects did not help, restart adapter
                throw new Error('Reconnect did not help, restart adapter');
            } else if (errorCount < 6 * deviceIds.length && connected) {
                cb && cb();
            } else {
                cb && cb('disconnect');
            }
        } else {
            let currentPollTime = (new Date()).valueOf() - startTime;
            if (pollTime !== null && pollTime !== undefined) {
                if (Math.abs(pollTime - currentPollTime) > 100) {
                    pollTime = currentPollTime;
                    adapter.setState('info.pollTime', currentPollTime, true);
                }
            } else {
                pollTime = currentPollTime;
                adapter.setState('info.pollTime', currentPollTime, true);
            }

            if (errorCount > 0) {
                adapter.setState('info.connection', true, true);
                errorCount = 0;
            }
            cb && cb();
        }
    }

    function pollDevice(device, callback) {
        adapter.log.debug(`Poll device ${device.coils.deviceId}`);
        let startTime = new Date().valueOf();
        let requestTimer = setTimeout(() => {
            requestTimer = null;
            if (connected && !isStop) {
                pollResult(startTime, 'App Timeout', callback);
            }
        }, options.config.timeout + 200);

        // TODO: use promises here
        pollBinariesBlocks(device, 'disInputs', 'readDiscreteInputs', err => {
            if (err) {
                if (requestTimer) {
                    clearTimeout(requestTimer);
                    requestTimer = null;
                    if (connected && !isStop) {
                        pollResult(startTime, err, callback);
                    }
                }
            } else {
                pollBinariesBlocks(device, 'coils', 'readCoils', err => {
                    if (err) {
                        if (requestTimer) {
                            clearTimeout(requestTimer);
                            requestTimer = null;
                            if (connected && !isStop) {
                                pollResult(startTime, err, callback);
                            }
                        }
                    } else {
                        pollFloatsBlocks(device, 'inputRegs', 'readInputRegisters', err => {
                            if (err) {
                                if (requestTimer) {
                                    clearTimeout(requestTimer);
                                    requestTimer = null;
                                    if (connected && !isStop) {
                                        pollResult(startTime, err, callback);
                                    }
                                }
                            } else {
                                pollFloatsBlocks(device, 'holdingRegs', 'readHoldingRegisters', err => {
                                    if (requestTimer) {
                                        clearTimeout(requestTimer);
                                        requestTimer = null;
                                        if (connected && !isStop) {
                                            pollResult(startTime, err, callback);
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    }

    function poll(i, cb) {
        if (typeof i === 'function') {
            cb = i;
            i = 0;
        }
        i = i || 0;
        if (i >= deviceIds.length) {
            if (deviceIds.find(id => !devices[id].err)) {
                nextPoll = setTimeout(function () {
					nextPoll = null;
                    poll();
                }, options.config.poll);
            } else {
                reconnect();
            }
            cb && cb();
        } else {
            pollDevice(devices[deviceIds[i]], err => {
                devices[deviceIds[i]].err = err;
                setImmediate(poll, i + 1, cb);
            });
        }
    }

    function send() {
        if (!modbusClient) {
            adapter.log.error('Client not connected');
            return;
        }

        let id = Object.keys(sendBuffer)[0];

        let type = objects[id].native.regType;
        let val  = sendBuffer[id];

        if (type === 'coils') {
            if (val === 'true'  || val === true)  val = 1;
            if (val === 'false' || val === false) val = 0;
            val = parseFloat(val);

            modbusClient.writeSingleCoil(objects[id].native.deviceId, objects[id].native.address, !!val).then(response => {
                adapter.log.debug('Write successfully [' + objects[id].native.address + ']: ' + val);
            }).catch(function (err) {
                adapter.log.error('Cannot write [' + objects[id].native.address + ']: ' + JSON.stringify(err));
                // still keep on communication
                if (!isStop) {
                    reconnect(true);
                }
            });
        } else if (type === 'holdingRegs') {
            if (objects[id].native.float === undefined) {
                objects[id].native.float =
                    objects[id].native.type === 'floatle'  || objects[id].native.type === 'floatbe'  || objects[id].native.type === 'floatsw' ||
                    objects[id].native.type === 'doublele' || objects[id].native.type === 'doublebe' || objects[id].native.type === 'floatsb';
            }

            if (objects[id].native.type !== 'string') {
                val = parseFloat(val);
                val = (val - objects[id].native.offset) / objects[id].native.factor;
                if (!objects[id].native.float) val = Math.round(val);
            }
            if (objects[id].native.len > 1) {
                let hrBuffer = common.writeValue(objects[id].native.type, val, objects[id].native.len);

                modbusClient.writeMultipleRegisters(objects[id].native.deviceId, objects[id].native.address, hrBuffer, function (err, response) {
                    adapter.log.debug('Write successfully [' + objects[id].native.address + ']: ' + val);
                }).catch(function (err) {
                    adapter.log.error('Cannot write [' + objects[id].native.address + ']: ' + JSON.stringify(err));
                    // still keep on communication
                    if (!isStop) {
                        reconnect(true);
                    }
                });
            } else {
                if (!modbusClient) {
                    adapter.log.error('Client not connected');
                    return;
                }
                let buffer = common.writeValue(objects[id].native.type, val, objects[id].native.len);

                modbusClient.writeSingleRegister(objects[id].native.deviceId, objects[id].native.address, buffer).then(function (response) {
                    adapter.log.debug('Write successfully [' + objects[id].native.address + ': ' + val);
                }).catch(function (err) {
                    adapter.log.error('Cannot write [' + objects[id].native.address + ']: ' + JSON.stringify(err));
                    // still keep on communication
                    if (!isStop) {
                        reconnect(true);
                    }
                });
            }
        }

        delete(sendBuffer[id]);
        if (Object.keys(sendBuffer).length) {
            setTimeout(send, 0);
        }
    }

    function writeHelper(id, state) {
        sendBuffer[id] = state.val;

        if (Object.keys(sendBuffer).length === 1) {
            send();
        }
    }

    this.write = (id, state) => {
        if (objects[id].native.regType === 'coils' || objects[id].native.regType === 'holdingRegs') {
            if (!objects[id].native.wp) {
                writeHelper(id, state);

                setTimeout(function () {
                    let _id = id.substring(adapter.namespace.length + 1);
                    adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true, function (err) {
                        // analyse if the state could be set (because of permissions)
                        if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                    });
                }, options.config.poll * 1.5);

            } else {
                if (pulseList[id] === undefined) {
                    let _id = id.substring(adapter.namespace.length + 1);
                    pulseList[id] = ackObjects[_id] ? ackObjects[_id].val : !state.val;

                    setTimeout(function () {
                        writeHelper(id, {val: pulseList[id]});

                        setTimeout(function () {
                            if (ackObjects[_id]) {
                                adapter.setState(id, ackObjects[_id].val, true, function (err) {
                                    // analyse if the state could be set (because of permissions)
                                    if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                                });
                            }
                            delete pulseList[id];
                        }, options.config.poll * 1.5);

                    }, options.config.pulsetime);

                    writeHelper(id, state);
                }
            }
        } else {
            setImmediate(() => {
                let _id = id.substring(adapter.namespace.length + 1);
                adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true, function (err) {
                    // analyse if the state could be set (because of permissions)
                    if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                });
            });
        }
    };

    this.start = () => {
        if (modbusClient && typeof modbusClient.connect === 'function') {
            modbusClient.connect();
        }
    };

    this.close = () => {
        isStop = true;
        if (nextPoll) {
            clearTimeout(nextPoll);
            nextPoll = null;
        }
        if (modbusClient) {
            try {
                modbusClient.close();
            } catch (e) {

            }
            modbusClient = null;
        }
    };

    (function _constructor () {
        adapter.setState('info.connection', false, true);

        if (options.config.type === 'tcp') {
            const tcp = options.config.tcp;
            if (!tcp || !tcp.bind || tcp.bind === '0.0.0.0') {
                adapter.log.error('IP address is not defined');
                return;
            }
            try {
                modbusClient = Modbus('client', 'tcp')({
                    options: {
                        tcp: {
                            host:          tcp.bind,
                            port:          parseInt(tcp.port, 10) || 502,
                            autoReconnect: false,
                        },
                        log:           adapter.log,
                        timeout:       options.config.timeout,
                        unitId:        options.config.defaultDeviceId
                    }
                });
            } catch (e) {
                adapter.log.error('Cannot connect to "' + tcp.bind + ':' + (parseInt(tcp.port, 10) || 502) + '": ' + e);
            }
        } else if (options.config.type === 'tcprtu') {
            const tcp = options.config.tcp;
            if (!tcp || !tcp.bind || tcp.bind === '0.0.0.0') {
                adapter.log.error('IP address is not defined');
                return;
            }
            try {
                modbusClient = Modbus('client', 'tcp-rtu')({
                    tcp: {
                        host:           tcp.bind,
                        port:           parseInt(tcp.port, 10) || 502,
                        autoReconnect:  false,
                    },
                    log:            adapter.log,
                    timeout:        options.config.timeout,
                    unitId:         options.config.defaultDeviceId
                });
            } catch (e) {
                adapter.log.error('Cannot connect to "' + tcp.bind + ':' + (parseInt(tcp.port, 10) || 502) + '": ' + e);
            }
        } else if (options.config.type === 'serial') {
            const serial = options.config.serial;
            if (!serial || !serial.comName) {
                adapter.log.error('Serial devicename is not defined');
                return;
            }

            try {
                modbusClient = Modbus('client', 'serial')({
                    options: {
                        serial: {
                            portName:       serial.comName,
                            baudRate:       parseInt(serial.baudRate, 10) || 9600,
                            dataBits:       parseInt(serial.dataBits, 10) || 8,
                            stopBits:       parseInt(serial.stopBits, 10) || 1,
                            parity:         serial.parity || 'none',
                        },
                        log:            adapter.log,
                        timeout:        options.config.timeout,
                        unitId:         options.config.defaultDeviceId
                    }
                });
            } catch (e) {
                adapter.log.error('Cannot open port "' + serial.comName + '" [' + (parseInt(serial.baudRate, 10) || 9600) + ']: ' + e);
            }
        } else {
            adapter.log.error(`Unsupported type ${options.config.type}"`);
            return;
        }

        if (!modbusClient) {
            adapter.log.error('Cannot create modbus master!');
            return;
        }
        modbusClient.on('connect', function () {
            if (!connected) {
                if (options.config.type === 'tcp') {
                    adapter.log.info('Connected to slave ' + options.config.tcp.bind);
                } else {
                    adapter.log.info('Connected to slave');
                }
                connected = true;
                adapter.setState('info.connection', true, true);
            }

            if (nextPoll) {
                clearTimeout(nextPoll);
                nextPoll = null;
            }

            poll();
        }).on('disconnect', () => {
            if (isStop) return;
            setTimeout(reconnect, 1000);
        });

        modbusClient.on('close', () => {
            if (isStop) return;
            setTimeout(reconnect, 1000);
        });

        modbusClient.on('error', err => {
            if (isStop) return;
            adapter.log.warn('On error: ' + JSON.stringify(err));
            setTimeout(reconnect, 1000);
        });

        modbusClient.on('trashCurrentRequest', err => {
            if (isStop) return;
            adapter.log.warn('Error: ' + JSON.stringify(err));
            setTimeout(reconnect, 1000);
        });
    })();

    return this;
}

module.exports = Master;
