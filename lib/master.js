'use strict';
const common = require(__dirname + '/common.js');
const fs = require('fs');

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
    let requestTimer;
    let connectTimer;
    let nextPoll;
    let ackObjects    = {};
    let objects = options.objects;
    let isStop = false;
    let pollTime;
    let errorCount;
    let pulseList  = {};
    let sendBuffer = {};

    function initTcp() {
        let client = {
            tcp: {
                core:     require(__dirname + '/modbus-tcp-client.js'),
                complete: require(__dirname + '/modbus-tcp-client.js')
            },
            handler: {

            }
        };
        const path = common.getJSModbusPath();

        fs.readdirSync(path + '/src/handler/client')
            .filter(function (file) {
                return file.substr(-3) === '.js';

            }).forEach(function (file) {

            client.tcp.complete = client.tcp.complete.compose(require(path + '/src/handler/client/' + file));
            client.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/client/' + file);
        });
        return client;
    }

    function initTcpRtu() {
        let client = {
            tcp: {
                core:     require(__dirname + '/modbus-tcp-rtu-client.js'),
                complete: require(__dirname + '/modbus-tcp-rtu-client.js')
            },
            handler: {

            }
        };
        const path = common.getJSModbusPath();

        fs.readdirSync(path + '/src/handler/client')
            .filter(function (file) {
                return file.substr(-3) === '.js';

            }).forEach(function (file) {

            client.tcp.complete = client.tcp.complete.compose(require(path + '/src/handler/client/' + file));
            client.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/client/' + file);
        });
        return client;
    }

    function initSerial() {
        let client = {
            serial      : {
                core        : require(__dirname + '/modbus-serial-client.js'),
                complete    : require(__dirname + '/modbus-serial-client.js')
            },
            handler     : { }
        };
        const path = common.getJSModbusPath();

        fs.readdirSync(path + '/src/handler/client')
            .filter(function (file) {
                return file.substr(-3) === '.js';
            }).forEach(function (file) {

            client.serial.complete = client.serial.complete.compose(require(path + '/src/handler/client/' + file));
            client.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/client/' + file);
        });

        return client;
    }

    function reconnect(isImmediately) {
        if (requestTimer) {
            clearTimeout(requestTimer);
            requestTimer = null;
        }

        try {
            if (modbusClient) {
                modbusClient.close();
            }
        } catch (e) {
            adapter.log.error('Cannot close master: ' + e);
        }

        if (connected) {
            adapter.log.info('Disconnected from slave ' + options.config.tcp.bind);
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

    function pollDisInputs(callback) {
        let regs = options.disInputs;
        if (regs.length) {
            modbusClient.readDiscreteInputs(regs.addressLow, regs.length).then(registers => {
                for (let n = 0; regs.config.length > n; n++) {
                    let id = regs.config[n].id;
                    //!!!!!! really coils. jsmodbus is very strange
                    let val = registers.coils[regs.config[n].address - regs.addressLow];

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, !!val, true, err => {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
                callback();
            }).fail(err => {
                callback(err);
            });
        } else {
            callback();
        }
    }

    function pollCoils(callback) {
        let regs = options.coils;
        if (regs.length) {
            modbusClient.readCoils(regs.addressLow, regs.length).then(registers => {
                // registers = {
                //     fc:          fc,
                //     byteCount:   byteCount,
                //     payload:     pdu.slice(2),
                //     coils:       []
                // };

                for (let n = 0; regs.config.length > n; n++) {
                    let id = regs.config[n].id;
                    let val = registers.coils[regs.config[n].address - regs.addressLow];

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, !!val, true, (err) => {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
                callback();
            }).fail(err => {
                callback(err);
            });
        } else {
            callback();
        }
    }

    function pollInputRegsBlock(block, callback) {
        let regs = options.inputRegs;

        if (block >= regs.blocks.length) {
            return callback();
        }

        const regBlock = regs.blocks[block];

        if (regBlock.startIndex === regBlock.endIndex) {
            regBlock.endIndex++;
        }

        modbusClient.readInputRegisters(regBlock.start, regBlock.count).then(buffer => {
            if (buffer.payload && buffer.payload.length) {
                for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                    let id = regs.config[n].id;
                    let val = common.extractValue(regs.config[n].type, regs.config[n].len, buffer.payload, regs.config[n].address - regBlock[block].start);
                    if (regs.config[n].type !== 'string') {
                        val = val * regs.config[n].factor + regs.config[n].offset;
                        val = Math.round(val * options.config.round) / options.config.round;
                    }
                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, val, true, err => {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
            } else {
                adapter.log.warn('Null buffer length READ_INPUT_REGISTERS for register ' + regBlock.start);
            }
            setImmediate(() => {
                pollInputRegsBlock(block + 1, callback);
            });
        }).fail(err => {
            callback(err);
        });
    }
    function pollInputRegsBlocks(callback) {
        let regs = options.inputRegs;
        if (regs.length) {
            pollInputRegsBlock(0, callback);
        } else {
            callback();
        }
    }

    function pollHoldingRegsBlock(block, callback) {
        let regs = options.holdingRegs;
        if (block >= regs.blocks.length) {
            return callback();
        }

        const regBlock = regs.blocks[block];

        if (regBlock.startIndex === regBlock.endIndex) {
            regBlock.endIndex++;
        }

        modbusClient.readHoldingRegisters(regBlock.start, regBlock.count).then(function (buffer) {
            if (buffer.payload && buffer.payload.length) {
                for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                    let id = regs.config[n].id;
                    let val = common.extractValue(regs.config[n].type, regs.config[n].len, buffer.payload, regs.config[n].address - regBlock.start);
                    if (regs.config[n].type !== 'string') {
                        val = val * regs.config[n].factor + regs.config[n].offset;
                        val = Math.round(val * options.config.round) / options.config.round;
                    }

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, val, true, err => {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
            } else {
                adapter.log.warn('Null buffer length READ_HOLDING_REGISTERS for register ' + regBlock.start);
            }

            // special case
            if (options.config.maxBlock < 2 && regs.config[regBlock.startIndex].cw) {
                // write immediately the current value
                writeCyclicHoldingReg(objects[regs.config[regBlock.startIndex].fullId], () => {
                    pollHoldingRegsBlock(block + 1, callback);
                });
            } else {
                setImmediate(function () {
                    pollHoldingRegsBlock(block + 1, callback);
                });
            }
        }).fail(err => {
            callback(err);
        });
    }

    function pollHoldingRegsBlocks(callback) {
        let regs = options.holdingRegs;
        if (regs.length) {
            pollHoldingRegsBlock(0, err => {
                if (regs.cyclicWrite.length && options.config.maxBlock >= 2) {
                    writeCyclicHoldingRegs(0, callback);
                } else {
                    callback(err);
                }
            });
        } else {
            callback();
        }
    }

    function writeCyclicHoldingReg(obj, callback) {
        let regs = options.holdingRegs;
        if (obj.native.len > 1) {
            let buffer = new Buffer(obj.native.len * 2);
            for (let b = 0; b < buffer.length; b++) {
                buffer[b] = regs.config[(obj.native.address - regs.addressLow) * 2 + b];
            }
            modbusClient.writeMultipleRegisters(obj.native.address, buffer).then(response => {
                callback();
            }).fail(err => {
                adapter.log.error('Cannot write: ' + JSON.stringify(err));
                callback(err);
            });
        } else {
            callback();
        }
    }

    function writeCyclicHoldingRegs(i, callback) {
        let regs = options.holdingRegs;

        if (i >= regs.cyclicWrite.length) {
            return callback();
        }

        let id = regs.cyclicWrite[i];

        writeCyclicHoldingReg(objects[id], () => {
            writeCyclicHoldingRegs(i + 1, callback);
        });
    }

    function pollResult(startTime, err) {
        if (err) {
            errorCount++;

            adapter.log.warn('Poll error count: ' + errorCount + ' code: ' + JSON.stringify(err));
            adapter.setState('info.connection', false, true);

            if (errorCount > 12) { // 2 reconnects did not help, restart adapter
                throw new Error('Reconnect did not help, restart adapter');
            }
            else if (errorCount % 6 !== 0 && connected) {
                setTimeout(poll, options.config.poll);
            } else {
                reconnect();
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
            nextPoll = setTimeout(poll, options.config.poll);
        }
    }

    function poll() {
        let startTime = (new Date()).valueOf();
        requestTimer = setTimeout(function () {
            pollResult(startTime, 'App Timeout');
        }, options.config.timeout + 200);

        // TODO: use promises here
        pollDisInputs(err => {
            if (err) {
                pollResult(startTime, err);
            } else {
                pollCoils(err => {
                    if (err) {
                        pollResult(startTime, err);
                    } else {
                        pollInputRegsBlocks(err => {
                            if (err) {
                                pollResult(startTime, err);
                            } else {
                                pollHoldingRegsBlocks(err => {
                                    clearTimeout(requestTimer);
                                    requestTimer = null;
                                    pollResult(startTime, err);
                                });
                            }
                        });
                    }
                });
            }
        });
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

            modbusClient.writeSingleCoil(objects[id].native.address, !!val).then(response => {
                adapter.log.debug('Write successfully [' + objects[id].native.address + ']: ' + val);
            }).fail(function (err) {
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

                modbusClient.writeMultipleRegisters(objects[id].native.address, hrBuffer, function (err, response) {
                    adapter.log.debug('Write successfully [' + objects[id].native.address + ']: ' + val);
                }).fail(function (err) {
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

                modbusClient.writeSingleRegister(objects[id].native.address, buffer).then(function (response) {
                    adapter.log.debug('Write successfully [' + objects[id].native.address + ': ' + val);
                }).fail(function (err) {
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
            setTimeout(function () {
                let _id = id.substring(adapter.namespace.length + 1);
                adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true, function (err) {
                    // analyse if the state could be set (because of permissions)
                    if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                });
            }, 0);
        }
    };

    this.start = () => {
        if (typeof modbusClient.connect === 'function') {
            modbusClient.connect();
        }
    };

    this.close = () => {
        isStop = true;
        if (requestTimer) {
            clearTimeout(requestTimer);
            requestTimer = null;
        }
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
                let client = initTcp();

                modbusClient = client.tcp.complete({
                    host:          tcp.bind,
                    port:          parseInt(tcp.port, 10) || 502,
                    logEnabled:    true,
                    logLevel:      process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                    logTimestamp:  true,
                    autoReconnect: false,
                    timeout:       options.config.timeout,
                    unitId:        options.config.defaultDeviceId
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
                let client = initTcpRtu();

                modbusClient = client.tcp.complete({
                    host:           tcp.bind,
                    port:           parseInt(tcp.port, 10) || 502,
                    logEnabled:     true,
                    logLevel:       process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                    logTimestamp:   true,
                    autoReconnect:  false,
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
            let client = initSerial();
            try {

                modbusClient = client.serial.complete({
                    portName:       serial.comName,
                    baudRate:       parseInt(serial.baudRate, 10) || 9600,
                    logEnabled:     true,
                    logLevel:       process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                    logTimestamp:   true,
                    dataBits:       parseInt(serial.dataBits, 10) || 8,
                    stopBits:       parseInt(serial.stopBits, 10) || 1,
                    timeout:        options.config.timeout,
                    parity:         serial.parity || 'none',
                    unitId:         options.config.defaultDeviceId
                });
            } catch (e) {
                adapter.log.error('Cannot open port "' + serial.comName + '" [' + (parseInt(serial.baudRate, 10) || 9600) + ']: ' + e);
            }
        } else {
            adapter.log.error('Unsupported type "' + options.config.type + '"');
            return;
        }

        if (!modbusClient) {
            adapter.log.error('Cannot create modbus master!');
            return;
        }
        modbusClient.on('connect', function () {
            if (!connected) {
                if (options.config.type === 'tcp') {
                    adapter.log.info('Connected to slave ' + options.common.tcp.bind);
                } else {
                    adapter.log.info('Connected to slave');
                }
                connected = true;
                adapter.setState('info.connection', true, true);
            }
            poll();
        }).on('disconnect', function () {
            if (isStop) return;
            setTimeout(function () {
                main.reconnect();
            }, 1000);
        });

        modbusClient.on('error', function (err) {
            if (isStop) return;
            adapter.log.warn('On error: ' + JSON.stringify(err));
            setTimeout(function () {
                reconnect();
            }, 1000);
        });

        modbusClient.on('trashCurrentRequest', function (err) {
            if (isStop) return;
            adapter.log.warn('Error: ' + JSON.stringify(err));
            setTimeout(function () {
                reconnect();
            }, 1000);
        });
    })();

    return this;
}

module.exports = Master;
