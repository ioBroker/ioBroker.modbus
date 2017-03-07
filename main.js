/* jshint -W097 */// jshint strict:false
/* jslint node: true */

'use strict';

var utils         = require(__dirname + '/lib/utils');
var modbus        = require('jsmodbus');
var modbusClient  = null; //Master
var modbusServer  = null; //Slave
var connected     = false;
var connectTimer  = null;
var serialport    = null;

var nextPoll;
var ackObjects    = {};
var isStop        = false;
var pathMod;
var fs;

var adapter       = utils.adapter({
    name: 'modbus',
    unload: stop
});

process.on('SIGINT', stop);

adapter.on('ready', function () {
    try {
        serialport = require('serialport');
    } catch (err) {
        adapter.log.warn('Serial is not available');
    }

    adapter.setState('info.connection', adapter.config.params.slave ? 0 : false, true);
    main.main();
});

adapter.on('message', function (obj) {
    if (obj) {
        switch (obj.command) {
            case 'listUart':
                if (obj.callback) {
                    if (serialport) {
                        // read all found serial ports
                        serialport.list(function (err, ports) {
                            listSerial(ports);
                            adapter.log.info('List of port: ' + JSON.stringify(ports));
                            adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                        });
                    } else {
                        adapter.log.warn('Module serialport is not available');
                        adapter.sendTo(obj.from, obj.command, [{comName: 'Not available'}], obj.callback);
                    }
                }
                break;
        }
    }
});

function stop(callback) {
    isStop = true;
    if (adapter && adapter.setState) {

        if (main && main.requestTimer) {
            clearTimeout(main.requestTimer);
            main.requestTimer = null;
        }

        if (modbusClient) {
            try {
                modbusClient.close();
            } catch (e) {

            }
        }
        if (modbusServer) {
            try {
                modbusServer.close();
            } catch (e) {

            }
        }

        if (adapter.config && adapter.config.params) {
            adapter.setState('info.connection', adapter.config.params.slave ? 0 : false, true);
        }
    }
    if (nextPoll) clearTimeout(nextPoll);
    if (callback) callback();
}

var pulseList  = {};
var sendBuffer = {};
var objects    = {};
var enums      = {};
var infoRegExp = new RegExp(adapter.namespace.replace('.', '\\.') + '\\.info\\.');

adapter.on('stateChange', function (id, state) {
    if (state && !state.ack && id && !infoRegExp.test(id)) {
        if (objects[id]) {
            prepareWrite(id, state);
        } else {
            adapter.getObject(id, function (err, data) {
                if (!err) {
                    objects[id] = data;
                    prepareWrite(id, state);
                }
            });
        }
    }
});

function filterSerialPorts(path) {
    // get only serial port names
    if (!(/(tty(S|ACM|USB|AMA|MFD)|rfcomm)/).test(path)) return false;

    return fs
        .statSync(path)
        .isCharacterDevice();
}

function listSerial(ports) {
    ports = ports || [];
    pathMod  = pathMod || require('path');
    fs    = fs   || require('fs');

    // Filter out the devices that aren't serial ports
    var devDirName = '/dev';

    var result;
    try {
        result = fs
            .readdirSync(devDirName)
            .map(function (file) {
                return pathMod.join(devDirName, file);
            })
            .filter(filterSerialPorts)
            .map(function (port) {
                var found = false;
                for (var v = 0; v < ports.length; v++) {
                    if (ports[v].comName === port) {
                        found = true;
                        break;
                    }
                }
                if (!found) ports.push({comName: port});
                return {comName: port};
            });
    } catch (e) {
        if (require('os').platform() !== 'win32') {
            adapter.log.error('Cannot read "' + devDirName + '": ' + e);
        }
        result = [];
    }
    return result;
}

function writeHelper(id, state) {
    sendBuffer[id] = state.val;

    if (Object.keys(sendBuffer).length === 1) send();
}

function prepareWrite(id, state) {
    if (objects[id].native.float === undefined) {
        objects[id].native.float =
            objects[id].native.type === 'floatle'  || objects[id].native.type === 'floatbe'  || objects[id].native.type === 'floatsw' ||
            objects[id].native.type === 'doublele' || objects[id].native.type === 'doublebe' || objects[id].native.type === 'floatsb';
    }
    var val;
    var buffer;
    var b;

    if (main.acp.slave) {
        var t = typeof state.val;
        if (objects[id].native.regType === 'disInputs') {
            main.disInputsChanged = true;
            if (t === 'boolean' || t === 'number') {
                main.disInputs[objects[id].native.address - main.disInputsLowAddress] = state.val ? 1 : 0;
            } else {
                main.disInputs[objects[id].native.address - main.disInputsLowAddress] = parseInt(state.val, 10) ? 1 : 0;
            }
        } else if (objects[id].native.regType === 'coils') {
            main.coilsChanged = true;
            if (t === 'boolean' || t === 'number') {
                main.coils[objects[id].native.address - main.coilsLowAddress] = state.val ? 1 : 0;
            } else {
                main.coils[objects[id].native.address - main.coilsLowAddress] = parseInt(state.val, 10) ? 1 : 0;
            }
        } else if (objects[id].native.regType === 'inputRegs') {
            main.inputRegsChanged = true;
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
            buffer = writeValue(objects[id].native.type, val, objects[id].native.len);
            for (b = 0; b < buffer.length; b++) {
                main.inputRegs[(objects[id].native.address - main.inputRegsLowAddress) * 2 + b] = buffer[b];
            }
        } else if (objects[id].native.regType === 'holdingRegs') {
            main.holdingRegsChanged = true;
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
            buffer = writeValue(objects[id].native.type, val, objects[id].native.len);
            for (b = 0; b < buffer.length; b++) {
                main.holdingRegs[(objects[id].native.address - main.holdingRegsLowAddress) * 2 + b] = buffer[b];
            }
        } else {
            adapter.log.error('Unknown state "' + id + '" type: ' + objects[id].native.regType);
        }
    } else {
        if (objects[id].native.regType === 'coils' || objects[id].native.regType === 'holdingRegs') {

            if (!objects[id].native.wp) {
                writeHelper(id, state);
                setTimeout(function () {
                    var _id = id.substring(adapter.namespace.length + 1);
                    adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true, function (err) {
                        // analyse if the state could be set (because of permissions)
                        if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                    });
                }, main.acp.poll * 1.5);

            } else {
                if (pulseList[id] === undefined) {
                    var _id = id.substring(adapter.namespace.length + 1);
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
                        }, main.acp.poll * 1.5);

                    }, main.acp.pulsetime);

                    writeHelper(id, state);
                }
            }
        } else {
            setTimeout(function () {
                var _id = id.substring(adapter.namespace.length + 1);
                adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true, function (err) {
                    // analyse if the state could be set (because of permissions)
                    if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                });
            }, 0);
        }
    }
}

function send() {
    if (!modbusClient) {
        adapter.log.error('Client not connected');
        return;
    }

    var id = Object.keys(sendBuffer)[0];

    var type = objects[id].native.regType;
    var val  = sendBuffer[id];

    if (type === 'coils') {
        if (!modbusClient) {
            adapter.log.error('Client not connected');
            return;
        }
        if (val === 'true'  || val === true)  val = 1;
        if (val === 'false' || val === false) val = 0;
        val = parseFloat(val);

        modbusClient.writeSingleCoil(objects[id].native.address, !!val).then(function (response) {
            adapter.log.debug('Write successfully [' + objects[id].native.address + ']: ' + val);
        }).fail(function (err) {
            adapter.log.error('Cannot write [' + objects[id].native.address + ']: ' + JSON.stringify(err));
            // still keep on communication
            if (!isStop) main.reconnect(true);
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
            var hrBuffer = writeValue(objects[id].native.type, val, objects[id].native.len);

            modbusClient.writeMultipleRegisters(objects[id].native.address, hrBuffer, function (err, response) {
                adapter.log.debug('Write successfully [' + objects[id].native.address + ']: ' + val);
            }).fail(function (err) {
                adapter.log.error('Cannot write [' + objects[id].native.address + ']: ' + JSON.stringify(err));
                // still keep on communication
                if (!isStop) main.reconnect(true);
            });
        } else {
            if (!modbusClient) {
                adapter.log.error('Client not connected');
                return;
            }
            var buffer = writeValue(objects[id].native.type, val, objects[id].native.len);

            modbusClient.writeSingleRegister(objects[id].native.address, buffer).then(function (response) {
                adapter.log.debug('Write successfully [' + objects[id].native.address + ': ' + val);
            }).fail(function (err) {
                adapter.log.error('Cannot write [' + objects[id].native.address + ']: ' + JSON.stringify(err));
                // still keep on communication
                if (!isStop) main.reconnect(true);
            });
        }
    }

    delete(sendBuffer[id]);
    if (Object.keys(sendBuffer).length) {
        setTimeout(send, 0);
    }
}

function addToEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            var pos = obj.common.members.indexOf(id);
            if (pos === -1) {
                obj.common.members.push(id);
                adapter.setForeignObject(obj._id, obj, function (err) {
                    if (callback) callback(err);
                });
            } else {
                if (callback) callback(err);
            }
        } else {
            if (callback) callback(err);
        }
    });
}

function removeFromEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            var pos = obj.common.members.indexOf(id);
            if (pos !== -1) {
                obj.common.members.splice(pos, 1);
                adapter.setForeignObject(obj._id, obj, function (err) {
                    if (callback) callback(err);
                });
            } else {
                if (callback) callback(err);
            }
        } else {
            if (callback) callback(err);
        }
    });
}

function syncEnums(enumGroup, id, newEnumName, callback) {
    if (!enums[enumGroup]) {
        adapter.getEnum(enumGroup, function (err, _enums) {
            enums[enumGroup] = _enums;
            syncEnums(enumGroup, id, newEnumName, callback);
        });
        return;
    }

    // try to find this id in enums
    var found = false;
    var count = 0;
    for (var e in enums[enumGroup]) {
        if (enums[enumGroup].hasOwnProperty(e) &&
            enums[enumGroup][e].common &&
            enums[enumGroup][e].common.members &&
            enums[enumGroup][e].common.members.indexOf(id) !== -1) {
            if (enums[enumGroup][e]._id !== newEnumName) {
                count++;
                removeFromEnum(enums[enumGroup][e]._id, id, function () {
                    if (!--count && typeof callback === 'function') callback();
                });
            } else {
                found = true;
            }
        }
    }
    if (!found && newEnumName) {
        count++;
        addToEnum(newEnumName, id, function () {
            if (!--count&& typeof callback === 'function') callback();
        });
    }

    if (!count && typeof callback === 'function') callback();
}

function extractValue(type, len, buffer, offset) {
    var i1;
    var i2;
    var buf;

    switch (type) {
        case 'uint8be':
            return buffer.readUInt8(offset * 2 + 1);
        case 'uint8le':
            return buffer.readUInt8(offset * 2);
        case 'int8be':
            return buffer.readInt8(offset * 2 + 1);
        case 'int8le':
            return buffer.readInt8(offset * 2);
        case 'uint16be':
            return buffer.readUInt16BE(offset * 2);
        case 'uint16le':
            return buffer.readUInt16LE(offset * 2);
        case 'int16be':
            return buffer.readInt16BE(offset * 2);
        case 'int16le':
            return buffer.readInt16LE(offset * 2);
        case 'uint32be':
            return buffer.readUInt32BE(offset * 2);
        case 'uint32le':
            return buffer.readUInt32LE(offset * 2);
        case 'uint32sw':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readUInt32BE(0);
        case 'uint32sb':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 1];
            buf[1] = buffer[offset * 2 + 0];
            buf[2] = buffer[offset * 2 + 3];
            buf[3] = buffer[offset * 2 + 2];
            return buf.readUInt32BE(0);
        case 'int32be':
            return buffer.readInt32BE(offset * 2);
        case 'int32le':
            return buffer.readInt32LE(offset * 2);
        case 'int32sw':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readInt32BE(0);
        case 'int32sb':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 1];
            buf[1] = buffer[offset * 2 + 0];
            buf[2] = buffer[offset * 2 + 3];
            buf[3] = buffer[offset * 2 + 2];
            return buf.readInt32BE(0);
        case 'uint64be':
            return buffer.readUInt32BE(offset * 2) * 0x100000000 + buffer.readUInt32BE(offset * 2 + 4);
        case 'uint64le':
            return buffer.readUInt32LE(offset * 2) + buffer.readUInt32LE(offset * 2 + 4) * 0x100000000;
        case 'int64be':
            i1 = buffer.readInt32BE(offset * 2);
            i2 = buffer.readUInt32BE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            } else {
                return i1 * 0x100000000 - i2; // I have no solution for that !
            }
            break;
        case 'int64le':
            i2 = buffer.readUInt32LE(offset * 2);
            i1 = buffer.readInt32LE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            } else {
                return i1 * 0x100000000 - i2; // I have no solution for that !
            }
            break;
        case 'floatbe':
            return buffer.readFloatBE(offset * 2);
        case 'floatle':
            return buffer.readFloatLE(offset * 2);
        case 'floatsw':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readFloatBE(0);
        case 'floatsb':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 1];
            buf[1] = buffer[offset * 2 + 0];
            buf[2] = buffer[offset * 2 + 3];
            buf[3] = buffer[offset * 2 + 2];
            return buf.readFloatBE(0);
        case 'doublebe':
            return buffer.readDoubleBE(offset * 2);
        case 'doublele':
            return buffer.readDoubleLE(offset * 2);
        case 'string':
            // find lenght
            var _len = 0;
            while (buffer[offset * 2 + _len] && _len < len * 2) {
                _len++;
            }

            return buffer.toString('ascii', offset * 2, offset * 2 + _len);
        default:
            adapter.log.error('Invalid type: ' + type);
            return 0;
    }
}

function writeValue(type, value, len) {
    var a0;
    var a1;
    var a2;
    var buffer;

    switch (type) {
        case 'uint8be':
            buffer = new Buffer(2);
            buffer[0] = 0;
            buffer.writeUInt8(value & 0xFF, 1);
            break;
        case 'uint8le':
            buffer = new Buffer(2);
            buffer[1] = 0;
            buffer.writeUInt8(value & 0xFF, 0);
            break;
        case 'int8be':
            buffer = new Buffer(2);
            buffer[0] = 0;
            buffer.writeInt8(value & 0xFF, 1);
            break;
        case 'int8le':
            buffer = new Buffer(2);
            buffer[1] = 0;
            buffer.writeInt8(value & 0xFF, 0);
            break;
        case 'uint16be':
            buffer = new Buffer(2);
            buffer.writeUInt16BE(value, 0);
            break;
        case 'uint16le':
            buffer = new Buffer(2);
            buffer.writeUInt16LE(value, 0);
            break;
        case 'int16be':
            buffer = new Buffer(2);
            buffer.writeInt16BE(value, 0);
            break;
        case 'int16le':
            buffer = new Buffer(2);
            buffer.writeInt16LE(value, 0);
            break;
        case 'uint32be':
            buffer = new Buffer(4);
            buffer.writeUInt32BE(value, 0);
            break;
        case 'uint32le':
            buffer = new Buffer(4);
            buffer.writeUInt32LE(value, 0);
            break;
        case 'uint32sw':
            buffer = new Buffer(4);
            buffer.writeUInt32BE(value, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'uint32sb':
            buffer = new Buffer(4);
            buffer.writeUInt32BE(value, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'int32be':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            break;
        case 'int32le':
            buffer = new Buffer(4);
            buffer.writeInt32LE(value, 0);
            break;
        case 'int32sw':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'int32sb':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'uint64be':
            buffer = new Buffer(8);
            buffer.writeUInt32BE(value >> 32, 0);
            buffer.writeUInt32BE(value & 0xFFFFFFFF, 4);
            break;
        case 'uint64le':
            buffer = new Buffer(8);
            buffer.writeUInt32LE(value & 0xFFFFFFFF, 0);
            buffer.writeUInt32LE(value >> 32, 4);
            break;
        case 'int64be':
            buffer = new Buffer(8);
            buffer.writeInt32BE(value >> 32, 0);
            buffer.writeUInt32BE(value & 0xFFFFFFFF, 4);
            break;
        case 'int64le':
            buffer = new Buffer(8);
            buffer.writeUInt32LE(value & 0xFFFFFFFF, 0);
            buffer.writeInt32LE(value >> 32, 4);
            break;
        case 'floatbe':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            break;
        case 'floatle':
            buffer = new Buffer(4);
            buffer.writeFloatLE(value, 0);
            break;
        case 'floatsw':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'floatsb':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'doublebe':
            buffer = new Buffer(8);
            buffer.writeDoubleBE(value, 0);
            break;
        case 'doublele':
            buffer = new Buffer(8);
            buffer.writeDoubleLE(value, 0);
            break;
        case 'string':
            if (value === null) value = 'null';
            value = value.toString();
            var _len = (value.length + 1);
            if (_len % 2) _len++;
            buffer = new Buffer(len);
            buffer.write(value, 0, value.length > _len ? _len : value.length, 'ascii');
            break;
        default:
            adapter.log.error('Invalid type: ' + type);
            buffer = new Buffer(2);
            break;
    }
    return buffer;
}

var type_items_len = {
    'uint8be':    1,
    'uint8le':    1,
    'int8be':     1,
    'int8le':     1,
    'uint16be':   1,
    'uint16le':   1,
    'int16be':    1,
    'int16le':    1,
    'int16be1':   1,
    'int16le1':   1,
    'uint32be':   2,
    'uint32le':   2,
    'uint32sw':   2,
    'uint32sb':   2,
    'int32be':    2,
    'int32le':    2,
    'int32sw':    2,
    'int32sb':    2,
    'uint64be':   4,
    'uint64le':   4,
    'int64be':    4,
    'int64le':    4,
    'floatbe':    2,
    'floatle':    2,
    'floatsw':    2,
    'floatsb':    2,
    'doublebe':   4,
    'doublele':   4,
    'string':     0
};

var _rmap = {
    0: 15,
    1: 14,
    2: 13,
    3: 12,
    4: 11,
    5: 10,
    6: 9,
    7: 8,
    8: 7,
    9: 6,
    10: 5,
    11: 4,
    12: 3,
    13: 2,
    14: 1,
    15: 0
};
var _dmap = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 11,
    12: 12,
    13: 13,
    14: 14,
    15: 15
};
function address2alias(id, address, isDirect) {
    if (typeof address                 === 'string') address                 = parseInt(address, 10);
    if (typeof main.acp[id + 'Offset'] === 'string') main.acp[id + 'Offset'] = parseInt(main.acp[id + 'Offset'], 10);

    if (id === 'disInputs' || id === 'coils') {
        address = Math.floor(address / 16) * 16 + (isDirect ? _dmap[address % 16] : _rmap[address % 16]);
        address += main.acp[id + 'Offset'];
        return address;
    } else {
        return address + main.acp[id + 'Offset'];
    }
}

function createExtendObject(id, objData, callback) {
    adapter.getObject(id, function (err, oldObj) {
        if (!err && oldObj) {
            adapter.extendObject(id, objData, callback);
        } else {
            adapter.setObjectNotExists(id, objData, callback);
        }
    });
}

function processTasks(tasks, callback) {
    if (!tasks || !tasks.length) {
        if (typeof callback === 'function') callback();
        return;
    }
    var task = tasks.shift();
    if (task.name === 'add') {
        createExtendObject(task.id, task.obj, function () {
            setTimeout(processTasks, 0, tasks, callback);
        });
    } else if (task.name === 'del') {
        adapter.delObject(task.id, function () {
            setTimeout(processTasks, 0, tasks, callback);
        });
    } else if (task.name === 'syncEnums') {
        syncEnums('rooms', task.id, task.obj, function () {
            setTimeout(processTasks, 0, tasks, callback);
        });
    } else {
        throw 'Unknown task';
    }
}

var main = {
    oldObjects:             [],
    newObjects:             [],

    disInputs:              [],
    disInputsLowAddress:    0,
    disInputsHighAddress:   0,
    disInputsLength:        0,

    coils:                  [],
    coilsLowAddress:        0,
    coilsHighAddress:       0,
    coilsLength:            0,
    coilsMapping:           [],

    inputRegs:              [],
    inputRegsLowAddress:    0,
    inputRegsHighAddress:   0,
    inputRegsLength:        0,
    inputRegsBlocks:        [],

    holdingRegs:            [],
    holdingRegsLowAddress:  0,
    holdingRegsHighAddress: 0,
    holdingRegsLength:      0,
    holdingRegsMapping:     [],
    holdingRegsBlocks:      [],
    holdingRegsCyclicWrite: [],

    unit:                   '',
    errorCount:             0,

    main: function () {
        main.ac                    = adapter.config;
        main.acp                   = adapter.config.params;
        main.acp.poll              = parseInt(main.acp.poll,  10) || 1000; // default is 1 second
        main.acp.recon             = parseInt(main.acp.recon, 10) || 60000;
        main.acp.port              = parseInt(main.acp.port,  10) || 502;
        main.acp.slave             = parseInt(main.acp.slave, 10) || 0;
        main.acp.round             = parseInt(main.acp.round, 10) || 0;
        main.acp.deviceId          = (main.acp.deviceId === undefined || main.acp.deviceId === null) ? 1 : (parseInt(main.acp.deviceId, 10) || 0);
        main.acp.disInputsOffset   = parseInt(main.acp.disInputsOffset,   10) || 10001;
        main.acp.coilsOffset       = parseInt(main.acp.coilsOffset,       10) || 1;
        main.acp.inputRegsOffset   = parseInt(main.acp.inputRegsOffset,   10) || 30001;
        main.acp.holdingRegsOffset = parseInt(main.acp.holdingRegsOffset, 10) || 40001;
        main.acp.maxBlock          = parseInt(main.acp.maxBlock, 10) || 100;

        main.acp.showAliases       = (main.acp.showAliases === true || main.acp.showAliases === 'true');

        main.acp.pulsetime         = parseInt(main.acp.pulsetime || 1000);
        main.acp.round             = Math.pow(10, main.acp.round);

        adapter.getForeignObjects(adapter.namespace + '.*', function (err, list) {

            main.oldObjects = list;

            main.ac.disInputs.sort(sortByAddress);
            main.ac.coils.sort(sortByAddress);
            main.ac.inputRegs.sort(sortByAddress);
            main.ac.holdingRegs.sort(sortByAddress);

            var i;
            var address;
            var lastAddress = null;
            var blockStart;
            var startIndex;
            var tasks = [];

            if (main.ac.disInputs.length) {
                for (i = main.ac.disInputs.length - 1; i >= 0; i--) {
                    address = parseInt(main.ac.disInputs[i].address, 10);
                    if (address < 0) {
                        adapter.log.error('Invalid discrete inputs address: ' + address);
                        main.ac.disInputs.splice(i, 1);
                        continue;
                    }
                    main.ac.disInputs[i].id = 'discreteInputs.';
                    if (main.acp.showAliases) {
                        main.ac.disInputs[i].id += address2alias('disInputs', address, main.acp.directAddresses);
                    } else {
                        main.ac.disInputs[i].id += address;
                    }
                    main.ac.disInputs[i].id += (main.ac.disInputs[i].name ? '_' + (main.ac.disInputs[i].name.replace('.', '_').replace(' ', '_')) : '');
                }
                if (main.ac.disInputs.length) {
                    main.ac.disInputs.sort(sortByAddress);
                    main.disInputsLowAddress  = Math.floor(main.ac.disInputs[0].address / 16) * 16;
                    main.disInputsHighAddress = main.ac.disInputs[main.ac.disInputs.length - 1].address;
                    main.disInputsLength      = main.disInputsHighAddress - main.disInputsLowAddress + 1;
                    if (main.disInputsLength % 16) main.disInputsLength = (Math.floor(main.disInputsLength / 16) + 1) * 16;
                } else {
                    main.disInputsLength = 0;
                }
            }

            if (main.ac.coils.length) {
                main.coilsLowAddress  = 0xFFFFFFFF;
                main.coilsHighAddress = 0;
                for (i = main.ac.coils.length - 1; i >= 0; i--) {
                    address = parseInt(main.ac.coils[i].address, 10);

                    if (address < 0) {
                        adapter.log.error('Invalid coils address: ' + address);
                        main.ac.coils.splice(i, 1);
                        continue;
                    }

                    main.ac.coils[i].id = 'coils.';
                    if (main.acp.showAliases) {
                        main.ac.coils[i].id += address2alias('coils', address, main.acp.directAddresses);
                    } else {
                        main.ac.coils[i].id += address;
                    }
                    main.ac.coils[i].id += (main.ac.coils[i].name ? '_' + (main.ac.coils[i].name.replace('.', '_').replace(' ', '_')) : '');

                    if (main.acp.slave || main.ac.coils[i].poll) {
                        if (address < main.coilsLowAddress)  main.coilsLowAddress  = address;
                        if (address > main.coilsHighAddress) main.coilsHighAddress = address;
                    }
                }
                if (main.ac.coils.length) {
                    main.ac.coils.sort(sortByAddress);
                    main.coilsLowAddress = Math.floor(main.coilsLowAddress / 16) * 16;
                    main.coilsLength = main.coilsHighAddress - main.coilsLowAddress + 1;
                    if (main.coilsLength % 16) main.coilsLength = (Math.floor(main.coilsLength / 16) + 1) * 16;
                } else {
                    main.coilsLength = 0;
                }
                for (i = 0; i <  main.ac.coils.length; i++) {
                    main.coilsMapping[main.ac.coils[i].address - main.coilsLowAddress] = adapter.namespace + '.' + main.ac.coils[i].id;
                }
            }

            if (main.ac.inputRegs.length) {
                for (i = main.ac.inputRegs.length - 1; i >= 0; i--) {
                    address = parseInt(main.ac.inputRegs[i].address, 10);
                    if (address < 0) {
                        adapter.log.error('Invalid input register address: ' + address);
                        main.ac.inputRegs.splice(i, 1);
                        continue;
                    }

                    main.ac.inputRegs[i].type   = main.ac.inputRegs[i].type || 'uint16be';
                    main.ac.inputRegs[i].offset = parseFloat(main.ac.inputRegs[i].offset) || 0;
                    main.ac.inputRegs[i].factor = parseFloat(main.ac.inputRegs[i].factor) || 1;
                    if (main.ac.inputRegs[i].type === 'string') {
                        main.ac.inputRegs[i].len = parseInt(main.ac.inputRegs[i].len) || 1;
                    } else {
                        main.ac.inputRegs[i].len = type_items_len[main.ac.inputRegs[i].type];
                    }
                    main.ac.inputRegs[i].len = main.ac.inputRegs[i].len || 1;

                    if (!main.ac.inputRegs[i].len) main.ac.inputRegs[i].len = parseInt(main.ac.inputRegs[i].len) || 1;

                    main.ac.inputRegs[i].id = 'inputRegisters.';
                    if (main.acp.showAliases) {
                        main.ac.inputRegs[i].id += address2alias('inputRegs', address, main.acp.directAddresses);
                    } else {
                        main.ac.inputRegs[i].id += address;
                    }

                    main.ac.inputRegs[i].id += (main.ac.inputRegs[i].name ? '_' + (main.ac.inputRegs[i].name.replace('.', '_').replace(' ', '_')) : '');

                }
                lastAddress = null;
                startIndex = 0;
                for (i = 0; i < main.ac.inputRegs.length; i++) {
                    address = parseInt(main.ac.inputRegs[i].address, 10);
                    if (address < 0) continue;
                    if (lastAddress === null) {
                        blockStart  = address;
                        startIndex = i;
                        lastAddress = address + main.ac.inputRegs[i].len;
                    }
                    // try to detect next block
                    if ((address - lastAddress > 10 && main.ac.inputRegs[i].len < 10) || (lastAddress - blockStart >= main.acp.maxBlock)) {
                        if (main.inputRegsBlocks.map(function (obj) {
                                return obj.start;
                            }).indexOf(blockStart) === -1) {
                            main.inputRegsBlocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                        }
                        blockStart  = address;
                        startIndex  = i;
                    }
                    lastAddress = address + main.ac.inputRegs[i].len;
                }
                if (main.inputRegsBlocks.map(function (obj) {
                        return obj.start;
                    }).indexOf(blockStart) === -1) {
                    main.inputRegsBlocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                }
                if (main.ac.inputRegs.length) {
                    main.inputRegsLowAddress  = main.ac.inputRegs[0].address;
                    main.inputRegsHighAddress = main.ac.inputRegs[main.ac.inputRegs.length - 1].address + main.ac.inputRegs[main.ac.inputRegs.length - 1].len;
                    main.inputRegsLength      = main.inputRegsHighAddress - main.inputRegsLowAddress;
                } else {
                    main.ac.inputRegs.length = 0;
                }
            }

            if (main.ac.holdingRegs.length) {
                main.holdingRegsLowAddress  = 0xFFFFFFFF;
                main.holdingRegsHighAddress = 0;

                for (i = main.ac.holdingRegs.length - 1; i >= 0; i--) {
                    address = parseInt(main.ac.holdingRegs[i].address, 10);
                    if (address < 0) {
                        adapter.log.error('Invalid holding register address: ' + address);
                        main.ac.holdingRegs.splice(i, 1);
                        continue;
                    }

                    main.ac.holdingRegs[i].type   = main.ac.holdingRegs[i].type || 'uint16be';
                    main.ac.holdingRegs[i].offset = parseFloat(main.ac.holdingRegs[i].offset) || 0;
                    main.ac.holdingRegs[i].factor = parseFloat(main.ac.holdingRegs[i].factor) || 1;
                    if (main.ac.holdingRegs[i].type === 'string') {
                        main.ac.holdingRegs[i].len = parseInt(main.ac.holdingRegs[i].len) || 1;
                    } else {
                        main.ac.holdingRegs[i].len = type_items_len[main.ac.holdingRegs[i].type];
                    }
                    main.ac.holdingRegs[i].len = main.ac.holdingRegs[i].len || 1;



                    main.ac.holdingRegs[i].id = 'holdingRegisters.';
                    if (main.acp.showAliases) {
                        main.ac.holdingRegs[i].id += address2alias('holdingRegs', address, main.acp.directAddresses);
                    } else {
                        main.ac.holdingRegs[i].id += address;
                    }
                    main.ac.holdingRegs[i].id += (main.ac.holdingRegs[i].name ? '_' + (main.ac.holdingRegs[i].name.replace('.', '_').replace(' ', '_')) : '');

                    // collect cyclic write registers
                    if (main.ac.holdingRegs[i].cw) {
                        main.holdingRegsCyclicWrite.push(adapter.namespace + '.' + main.ac.holdingRegs[i].id);
                    }

                    if (main.acp.slave || main.ac.holdingRegs[i].poll) {
                        if (address < main.holdingRegsLowAddress)  main.holdingRegsLowAddress  = address;
                        if (address + main.ac.holdingRegs[i].len > main.holdingRegsHighAddress) main.holdingRegsHighAddress = address + main.ac.holdingRegs[i].len;
                    }
                }

                lastAddress = null;
                startIndex = 0;
                for (i = 0; i < main.ac.holdingRegs.length; i++) {
                    address = parseInt(main.ac.holdingRegs[i].address, 10);
                    if (address < 0) continue;
                    if (lastAddress === null) {
                        startIndex  = i;
                        blockStart  = address;
                        lastAddress = address + main.ac.holdingRegs[i].len;
                    }
                    // try to detect next block
                    if ((address - lastAddress > 10 && main.ac.holdingRegs[i].len < 10) || (lastAddress - blockStart >= main.acp.maxBlock)) {
                        if (main.holdingRegsBlocks.map(function (obj) {
                                return obj.start;
                            }).indexOf(blockStart) === -1) {
                            main.holdingRegsBlocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                        }
                        blockStart  = address;
                        startIndex  = i;
                    }
                    lastAddress = address + main.ac.holdingRegs[i].len;
                }
                if (main.holdingRegsBlocks.map(function (obj) {
                        return obj.start;
                    }).indexOf(blockStart) === -1) {
                    main.holdingRegsBlocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                }

                if (main.ac.holdingRegs.length) {
                    main.holdingRegsLength = main.holdingRegsHighAddress - main.holdingRegsLowAddress;
                } else {
                    main.holdingRegsLength = 0;
                }

                lastAddress = null;
                for (i = 0; i < main.ac.holdingRegs.length; i++) {
                    main.holdingRegsMapping[main.ac.holdingRegs[i].address - main.holdingRegsLowAddress] = adapter.namespace + '.' + main.ac.holdingRegs[i].id;
                }
            }

            // ------------------ create devices -------------
            if (main.ac.disInputs.length > 0) {
                tasks.push({
                    id: 'discreteInputs',
                    name: 'add',
                    obj: {
                        type: 'channel',
                        common: {
                            name: 'Discrete inputs'
                        },
                        native: {}
                    }
                });
            }

            if (main.ac.coils.length > 0) {
                tasks.push({
                    id: 'coils',
                    name: 'add',
                    obj: {
                        type: 'channel',
                        common: {
                            name: 'Coils'
                        },
                        native: {}
                    }
                });
            }

            if (main.ac.inputRegs.length > 0) {
                tasks.push({
                    id: 'inputRegisters',
                    name: 'add',
                    obj: {
                        type: 'channel',
                        common: {
                            name: 'Input registers'
                        },
                        native: {}
                    }
                });
            }

            if (main.ac.holdingRegs.length > 0) {
                tasks.push({
                    id: 'holdingRegisters',
                    name: 'add',
                    obj: {
                        type: 'channel',
                        common: {
                            name: 'Holding registers'
                        },
                        native: {}
                    }
                });
            }

            var id;
            // ------------- create states and objects ----------------------------
            for (i = 0; main.ac.disInputs.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.disInputs[i].id;
                main.ac.disInputs[i].fullId = id;
                objects[id] = {
                    _id: main.ac.disInputs[i].id,
                    type: 'state',
                    common: {
                        name:    main.ac.disInputs[i].description,
                        role:    main.ac.disInputs[i].role,
                        type:    'boolean',
                        read:    true,
                        write:   false,
                        def:     false
                    },
                    native: {
                        regType:  'disInputs',
                        address:   main.ac.disInputs[i].address
                    }
                };
                tasks.push({
                    id: 'discreteInputs',
                    name: 'add',
                    obj: objects[id]
                });
                tasks.push({
                    id: id,
                    name: 'syncEnums',
                    obj: main.ac.disInputs[i].room
                });
                main.newObjects.push(id);
            }

            for (i = 0; main.ac.coils.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.coils[i].id;
                main.ac.coils[i].fullId = id;
                objects[id] = {
                    _id: main.ac.coils[i].id,
                    type: 'state',
                    common: {
                        name:    main.ac.coils[i].description,
                        role:    main.ac.coils[i].role,
                        type:    'boolean',
                        read:    true,
                        write:   true,
                        def:     false
                    },
                    native: {
                        regType:   'coils',
                        address:   main.ac.coils[i].address,
                        poll:      main.ac.coils[i].poll,
                        wp:        main.ac.coils[i].wp
                    }
                };

                tasks.push({
                    id: 'discreteInputs',
                    name: 'add',
                    obj: objects[id]
                });
                tasks.push({
                    id: id,
                    name: 'syncEnums',
                    obj: main.ac.coils[i].room
                });
                main.newObjects.push(id);
            }

            for (i = 0; main.ac.inputRegs.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.inputRegs[i].id;
                main.ac.inputRegs[i].fullId = id;
                objects[id] = {
                    _id: main.ac.inputRegs[i].id,
                    type: 'state',
                    common: {
                        name:    main.ac.inputRegs[i].description,
                        type:    'number',
                        read:    true,
                        write:   false,
                        def:     0,
                        role:    main.ac.inputRegs[i].role,
                        unit:    main.ac.inputRegs[i].unit || ''
                    },
                    native: {
                        regType:  'inputRegs',
                        address:   main.ac.inputRegs[i].address,
                        type:      main.ac.inputRegs[i].type,
                        len:       main.ac.inputRegs[i].len,
                        offset:    main.ac.inputRegs[i].offset,
                        factor:    main.ac.inputRegs[i].factor
                    }
                };
                tasks.push({
                    id: 'discreteInputs',
                    name: 'add',
                    obj: objects[id]
                });
                tasks.push({
                    id: id,
                    name: 'syncEnums',
                    obj: main.ac.inputRegs[i].room
                });
                main.newObjects.push(id);
            }

            for (i = 0; main.ac.holdingRegs.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.holdingRegs[i].id;
                main.ac.holdingRegs[i].fullId = id;
                objects[id] = {
                    _id: main.ac.holdingRegs[i].id,
                    type: 'state',
                    common: {
                        name:    main.ac.holdingRegs[i].description,
                        type:    'number',
                        read:    true,
                        write:   true,
                        def:     0,
                        role:    main.ac.holdingRegs[i].role,
                        unit:    main.ac.holdingRegs[i].unit || ''
                    },
                    native: {
                        regType:   'holdingRegs',
                        address:   main.ac.holdingRegs[i].address,
                        poll:      main.ac.holdingRegs[i].poll,/*,
                         wp:        main.ac.coils[i].wp*/
                        type:      main.ac.holdingRegs[i].type,
                        len:       main.ac.holdingRegs[i].len,
                        offset:    main.ac.holdingRegs[i].offset,
                        factor:    main.ac.holdingRegs[i].factor
                    }
                };
                tasks.push({
                    id: 'discreteInputs',
                    name: 'add',
                    obj: objects[id]
                });
                tasks.push({
                    id: id,
                    name: 'syncEnums',
                    obj: main.ac.holdingRegs[i].room
                });
                main.newObjects.push(id);
            }

            // ----------- remember poll values --------------------------
            if (!main.acp.slave) {
                for (i = 0; main.ac.disInputs.length > i; i++) {
                    main.disInputs.push(main.ac.disInputs[i]);
                }

                for (i = 0; main.ac.coils.length > i; i++) {
                    if (main.ac.coils[i].poll) {
                        main.coils.push(main.ac.coils[i]);
                    }
                }

                for (i = 0; main.ac.inputRegs.length > i; i++) {
                    main.inputRegs.push(main.ac.inputRegs[i]);
                }

                for (i = 0; main.ac.holdingRegs.length > i; i++) {
                    if (main.ac.holdingRegs[i].poll) {
                        main.holdingRegs.push(main.ac.holdingRegs[i]);
                    }
                }
            } else {
                // read all states
                adapter.getStates('*', function (err, states) {
                    var id;
                    // build ready arrays
                    for (i = 0; main.ac.disInputs.length > i; i++) {
                        id = main.ac.disInputs[i].fullId;
                        if (states[id] && states[id].val !== undefined) {
                            prepareWrite(id, states[id]);
                            //main.disInputs[main.ac.disInputs[i].address - main.disInputsLowAddress] = states[id].val;
                        } else {
                            adapter.setState(id, 0, true, function (err) {
                                // analyse if the state could be set (because of permissions)
                                if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                            });
                        }
                    }
                    // fill with 0 empty values
                    for (i = 0; i < main.disInputs.length; i++) {
                        if (main.disInputs[i] === undefined || main.disInputs[i] === null) {
                            main.disInputs[i] = 0;
                        } else if (typeof main.disInputs[i] === 'boolean') {
                            main.disInputs[i] = main.disInputs[i] ? 1 : 0;
                        } else if (typeof main.disInputs[i] !== 'number') {
                            main.disInputs[i] = parseInt(main.disInputs[i], 10) ? 1 : 0;
                        }
                    }

                    for (i = 0; main.ac.coils.length > i; i++) {
                        id = main.ac.coils[i].fullId;
                        if (states[id] && states[id].val !== undefined) {
                            prepareWrite(id, states[id]);
                            //main.coils[main.ac.coils[i].address - main.coilsLowAddress] = states[id].val;
                        } else {
                            adapter.setState(id, 0, true, function (err) {
                                // analyse if the state could be set (because of permissions)
                                if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                            });
                        }
                    }
                    // fill with 0 empty values
                    for (i = 0; i < main.coils.length; i++) {
                        if (main.coils[i] === undefined || main.coils[i] === null) {
                            main.coils[i] = 0;
                        } else if (typeof main.coils[i] === 'boolean') {
                            main.coils[i] = main.coils[i] ? 1 : 0;
                        } else if (typeof main.coils[i] !== 'number') {
                            main.coils[i] = parseInt(main.coils[i], 10) ? 1 : 0;
                        }
                    }

                    for (i = 0; main.ac.inputRegs.length > i; i++) {
                        id = main.ac.inputRegs[i].fullId;
                        if (states[id] && states[id].val !== undefined) {
                            //main.inputRegs[main.ac.inputRegs[i].address - main.inputRegsLowAddress] = states[id].val;
                            prepareWrite(id, states[id]);
                        } else {
                            adapter.setState(id, 0, true, function (err) {
                                // analyse if the state could be set (because of permissions)
                                if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                            });
                        }
                    }
                    // fill with 0 empty values
                    for (i = 0; i < main.inputRegs.length; i++) {
                        if (main.inputRegs[i] === undefined || main.inputRegs[i] === null) {
                            main.inputRegs[i] = 0;
                        } else if (typeof main.inputRegs[i] === 'boolean') {
                            main.inputRegs[i] = main.inputRegs[i] ? 1 : 0;
                        } else if (typeof main.inputRegs[i] !== 'number') {
                            main.inputRegs[i] = parseInt(main.inputRegs[i], 10);
                        }
                    }

                    for (i = 0; main.ac.holdingRegs.length > i; i++) {
                        id = main.ac.holdingRegs[i].fullId;
                        if (states[id] && states[id].val !== undefined) {
                            prepareWrite(id, states[id]);
                            //main.holdingRegs[main.ac.holdingRegs[i].address - main.holdingRegsLowAddress] = states[id].val;
                        } else {
                            adapter.setState(id, 0, true, function (err) {
                                // analyse if the state could be set (because of permissions)
                                if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                            });
                        }
                    }
                    // fill with 0 empty values
                    for (i = 0; i < main.holdingRegs.length; i++) {
                        if (main.holdingRegs[i] === undefined || main.holdingRegs[i] === null) {
                            main.holdingRegs[i] = 0;
                        } else if (typeof main.holdingRegs[i] === 'boolean') {
                            main.holdingRegs[i] = main.holdingRegs[i] ? 1 : 0;
                        } else if (typeof main.holdingRegs[i] !== 'number') {
                            main.holdingRegs[i] = parseInt(main.holdingRegs[i], 10);
                        }
                    }
                });
            }

            tasks.push({
                id: 'info',
                name: 'add',
                obj: {
                    type: 'channel',
                    common: {
                        name: 'info'
                    },
                    native: {}
                }
            });

            if (!main.acp.slave) {
                tasks.push({
                    id: 'info.pollTime',
                    name: 'add',
                    obj: {
                        type: 'state',
                        common: {
                            name: 'Poll time',
                            type: 'number',
                            role: '',
                            write: false,
                            read: true,
                            def:  0,
                            unit: 'ms'
                        },
                        native: {}
                    }
                });
                main.newObjects.push(adapter.namespace + '.info.pollTime');
            }

            adapter.getObject('info.connection', function (err, obj) {
                if (!obj) {
                    obj = {
                        type: 'state',
                        common: {
                            name:  'Number of connected partners',
                            role:  'indicator.connected',
                            write: false,
                            read:  true,
                            type:  main.acp.slave ? 'number' : 'boolean'
                        },
                        native: {}
                    };
                    adapter.setObjectNotExists('info.connection', obj);
                } else if (main.acp.slave && obj.common.type !== 'number') {
                    obj.common.type = 'number';
                    obj.common.name = 'Number of connected masters';
                    adapter.setObjectNotExists('info.connection', obj);
                } else if (!main.acp.slave && obj.common.type !== 'boolean') {
                    obj.common.type = 'boolean';
                    obj.common.name = 'If master connected';
                    adapter.setObjectNotExists('info.connection', obj);
                }
            });

            main.newObjects.push(adapter.namespace + '.info.connection');

            adapter.setState('info.connection', main.acp.slave ? 0 : false, true);

            main.acp.timeout = parseInt(main.acp.timeout, 10) || 5000;
            // clear unused states

            for (var id_ in main.oldObjects) {
                if (main.oldObjects.hasOwnProperty(id_) && main.newObjects.indexOf(id_) === -1) {
                    tasks.push({
                        id: id_,
                        name: 'del'
                    });
                }
            }
            processTasks(tasks, function () {
                main.oldObjects = [];
                main.newObjects = [];
                adapter.subscribeStates('*');
                main.start();
            });
        });
    },

    getListOfClients: function (clients) {
        var list = [];
        for (var c = 0; c < clients.length; c++) {
            var address = clients[c].address().address;
            if (address) list.push(address);
        }
        return list.join(',');
    },

    reconnect: function (isImmediately) {
        if (main.requestTimer) {
            clearTimeout(main.requestTimer);
            main.requestTimer = null;
        }

        try {
            if (modbusClient) modbusClient.close();
        } catch (e) {
            adapter.log.error('Cannot close master: ' + e);
        }
        if (connected) {
            adapter.log.info('Disconnected from slave ' + main.acp.bind);
            connected = false;
            adapter.setState('info.connection', main.acp.slave ? 0 : false, true);
        }
        if (!connectTimer) {
            connectTimer = setTimeout(function () {
                connectTimer = null;
                modbusClient.connect();
            }, isImmediately ? 1000 : main.acp.recon);
        }
    },
    start: function () {
        main.acp.type = main.acp.type || 'tcp';
        var fs;
        var path;
        var client;

        if (main.acp.slave) {
            var server = {
                tcp         : {
                    core        : require(__dirname + '/lib/modbus-tcp-server.js'),
                    complete    : require(__dirname + '/lib/modbus-tcp-server.js')
                },
                handler     : { }
            };
            fs = fs || require('fs');
            path = __dirname + '/node_modules/jsmodbus';
            if (!fs.existsSync(__dirname + '/node_modules/jsmodbus')) {
                path = __dirname + '/../jsmodbus';
            }

            main.coilsChanged       = true;
            main.inputRegsChanged   = true;
            main.disInputsChanged   = true;
            main.holdingRegsChanged = true;

            fs.readdirSync(path + '/src/handler/server')
                .filter(function (file) {
                    if (file === 'ReadDiscreteInputs.js') return false;
                    return file.substr(-3) === '.js';

                }).forEach(function (file) {

                server.tcp.complete = server.tcp.complete.compose(require(path + '/src/handler/server/' + file));
                server.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/server/' + file);

            });
            server.tcp.complete = server.tcp.complete.compose(require(__dirname + '/lib/ReadDiscreteInputs.js'));
            server.handler.ReadDiscreteInputs = require(__dirname + '/lib/ReadDiscreteInputs.js');

            var modbusServer = require('stampit')()
            .refs({
                logEnabled:    true,
                logLevel:      process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                port:          parseInt(main.acp.port, 10) || 502,
                responseDelay: 100,
                coils:         new Buffer(main.coilsHighAddress >> 3),
                discrete:      new Buffer(main.disInputsHighAddress >> 3),
                input:         new Buffer(main.inputRegsHighAddress * 2),
                holding:       new Buffer(main.holdingRegsHighAddress * 2)
            }).compose(server.tcp.complete)
            .init(function () {
                var that = this;
                this.on('readCoilsRequest', function (start, quantity) {
                    if (main.coilsChanged) {
                        main.coilsChanged = null;
                        var resp = new Array(Math.ceil(quantity / 16) * 2);
                        var i = 0;
                        var data = this.getCoils();
                        for (var j = 0; j < resp.length; j++) {
                            resp[j] = data.readUInt8(start + j);
                        }
                        while (i < quantity && i + start <= main.coilsHighAddress) {
                            if (main.coils[i + start - main.coilsLowAddress]) {
                                resp[Math.floor(i / 8)] |= 1 << (i % 8);
                            } else {
                                resp[Math.floor(i / 8)] &= ~(1 << (i % 8));
                            }
                            i++;
                        }
                        var len = data.length;
                        for (i = 0; i < resp.length; i++) {
                            if (start + i >= len) break;
                            data.writeUInt8(resp[i], start + i);
                        }
                    }
                });

                this.on('readDiscreteInputsRequest', function (start, quantity) {
                    if (main.disInputsChanged) {
                        main.disInputsChanged = false;
                        var resp = new Array(Math.ceil(quantity / 16) * 2);
                        var i = 0;
                        var data = this.getDiscrete();
                        for (var j = 0; j < resp.length; j++) {
                            resp[j] = data.readUInt8(start + j);
                        }
                        while (i < quantity && i + start <= main.disInputsHighAddress) {
                            if (main.disInputs[i + start - main.disInputsLowAddress]) {
                                resp[Math.floor(i / 8)] |= 1 << (i % 8);
                            } else {
                                resp[Math.floor(i / 8)] &= ~(1 << (i % 8));
                            }
                            i++;
                        }
                        var len = data.length;
                        for (i = 0; i < resp.length; i++) {
                            if (start + i >= len) break;
                            data.writeUInt8(resp[i], start + i);
                        }
                    }
                });

                this.on('readInputRegistersRequest', function (start, quantity) {
                    if (main.inputRegsChanged) {
                        main.inputRegsChanged = false;
                        var data = this.getInput();
                        var end  = start + quantity * 2;
                        var low  = main.inputRegsLowAddress  * 2;
                        var high = main.inputRegsHighAddress * 2;
                        for (var i = start; i < end; i++) {
                            if (i >= data.length) break;
                            if (i >= low && i < high) {
                                data.writeUInt8(main.inputRegs[i - low], i);
                            } else {
                                data.writeUInt8(0, i);
                            }
                        }
                    }
                });

                this.on('readHoldingRegistersRequest', function (start, quantity) {
                    if (main.holdingRegsChanged) {
                        main.holdingRegsChanged = false;
                        var data = this.getHolding();
                        var end  = start + quantity * 2;
                        var low  = main.holdingRegsLowAddress  * 2;
                        var high = main.holdingRegsHighAddress * 2;
                        for (var i = start; i < end; i++) {
                            if (i >= data.length) break;
                            if (i >= low && i < high) {
                                data.writeUInt8(main.holdingRegs[i - low], i);
                            } else {
                                data.writeUInt8(0, i);
                            }
                        }
                    }
                });

                this.on('postWriteSingleCoilRequest', function (start, value) {
                    var a = start - main.coilsLowAddress;

                    if (a >= 0 && main.coilsMapping[a]) {
                        adapter.setState(main.coilsMapping[a], value, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state: ' + err);
                        });
                        main.coils[a] = value;
                    }
                });
                var mPow2 = [
                    0x01,
                    0x02,
                    0x04,
                    0x08,
                    0x10,
                    0x20,
                    0x40,
                    0x80
                ];

                this.on('postWriteMultipleCoilsRequest', function (start, length, byteLength) {
                    var i = 0;
                    var data = this.getCoils();
                    if (start < main.coilsLowAddress) start = main.coilsLowAddress;

                    while (i < length && i + start <= main.coilsHighAddress) {
                        var a = i + start - main.coilsLowAddress;
                        if (a >= 0 && main.coilsMapping[a]) {
                            var value = data.readUInt8((i + start) >> 3);
                            value = value & mPow2[(i + start) % 8];
                            adapter.setState(main.coilsMapping[a], value ? true : false, true, function (err) {
                                // analyse if the state could be set (because of permissions)
                                if (err) adapter.log.error('Can not set state: ' + err);
                            });
                            main.coils[a] = value ? true : false;
                        }
                        i++;
                    }
                });

                this.on('postWriteSingleRegisterRequest', function (start, value) {
                    start = start >> 1;
                    var a = start - main.holdingRegsLowAddress;

                    if (a >= 0 && main.holdingRegsMapping[a]) {
                        var native = objects[main.holdingRegsMapping[a]].native;
                        var buf = new Buffer(2);
                        buf.writeUInt16BE(value);
                        var val = extractValue(native.type, native.len, buf, 0);

                        if (native.type !== 'string') {
                            val = (val - native.offset) / native.factor;
                            val = Math.round(val * main.acp.round) / main.acp.round;
                        }

                        adapter.setState(main.holdingRegsMapping[a], val, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state: ' + err);
                        });

                        main.holdingRegs[a]     = buf[0];
                        main.holdingRegs[a + 1] = buf[1];
                    }
                });

                this.on('postWriteMultipleRegistersRequest', function (start, length, byteLength) {
                    var data = this.getHolding();
                    var i = 0;
                    start = start >> 1;

                    if (start < main.holdingRegsLowAddress) start = main.holdingRegsLowAddress;

                    while (i < length && i + start <= main.holdingRegsHighAddress) {
                        var a = i + start - main.holdingRegsLowAddress;
                        if (a >= 0 && main.holdingRegsMapping[a]) {
                            var native = objects[main.holdingRegsMapping[a]].native;

                            var val = extractValue(native.type, native.len, data, i + start);
                            if (native.type !== 'string') {
                                val = val * native.factor + native.offset;
                                val = Math.round(val * main.acp.round) / main.acp.round;
                            }
                            adapter.setState(main.holdingRegsMapping[a], val, true, function (err) {
                                // analyse if the state could be set (because of permissions)
                                if (err) adapter.log.error('Can not set state: ' + err);
                            });
                            for (var k = 0; k < native.len * 2; k++) {
                                main.holdingRegs[a * 2 + k] = data.readUInt8(start * 2 + k);
                            }
                            i += native.len;
                        } else {
                            i++;
                        }
                    }
                });

                this.on('connection', function (client) {
                    var list = main.getListOfClients(that.getClients());
                    adapter.log.info('+ Clients connected: ' + list);
                    adapter.setState('info.connection', list, true);
                }).on('close', function (client) {
                    var list = main.getListOfClients(that.getClients());
                    adapter.log.info('- Client connected: ' + list);
                    adapter.setState('info.connection', list, true);
                }).on('error', function (err) {
                    var list = main.getListOfClients(that.getClients());
                    adapter.log.info('- Clients connected: ' + list);
                    adapter.setState('info.connection', list, true);
                    adapter.log.warn('Error on connection: ' + JSON.stringify(err));
                });

            });
            modbusServer();
        } else {
            if (main.acp.type === 'tcp') {
                if (!main.acp.bind || main.acp.bind === '0.0.0.0') {
                    adapter.log.error('IP address is not defined');
                    return;
                }
                try {
                    client = {
                        tcp         : {
                            core        : require(__dirname + '/lib/modbus-tcp-client.js'),
                            complete    : require(__dirname + '/lib/modbus-tcp-client.js')
                        },
                        handler     : { }
                    };
                    fs = fs || require('fs');
                    path = __dirname + '/node_modules/jsmodbus';
                    if (!fs.existsSync(__dirname + '/node_modules/jsmodbus')) {
                        path = __dirname + '/../jsmodbus';
                    }

                    fs.readdirSync(path + '/src/handler/client')
                        .filter(function (file) {
                            return file.substr(-3) === '.js';

                        }).forEach(function (file) {

                        client.tcp.complete = client.tcp.complete.compose(require(path + '/src/handler/client/' + file));
                        client.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/client/' + file);
                    });

                    modbusClient = client.tcp.complete({
                        host:          main.acp.bind,
                        port:          parseInt(main.acp.port, 10) || 502,
                        logEnabled:    true,
                        logLevel:      process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                        logTimestamp:  true,
                        autoReconnect: false,
                        timeout:       main.acp.timeout,
                        unitId:        main.acp.deviceId
                    });
                } catch (e) {
                    adapter.log.error('Cannot connect to "' + main.acp.bind + ':' + parseInt(main.acp.port, 10) || 502 + '": ' + e);
                }
            } else if (main.acp.type === 'tcprtu') {
                if (!main.acp.bind || main.acp.bind === '0.0.0.0') {
                    adapter.log.error('IP address is not defined');
                    return;
                }
                try {
                    client = {
                        tcp         : {
                            core        : require(__dirname + '/lib/modbus-tcp-rtu-client.js'),
                            complete    : require(__dirname + '/lib/modbus-tcp-rtu-client.js')
                        },
                        handler     : { }
                    };
                    fs = fs || require('fs');
                    path = __dirname + '/node_modules/jsmodbus';
                    if (!fs.existsSync(__dirname + '/node_modules/jsmodbus')) {
                        path = __dirname + '/../jsmodbus';
                    }

                    fs.readdirSync(path + '/src/handler/client')
                        .filter(function (file) {
                            return file.substr(-3) === '.js';

                        }).forEach(function (file) {

                        client.tcp.complete = client.tcp.complete.compose(require(path + '/src/handler/client/' + file));
                        client.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/client/' + file);
                    });

                    modbusClient = client.tcp.complete({
                        host:           main.acp.bind,
                        port:           parseInt(main.acp.port, 10) || 502,
                        logEnabled:     true,
                        logLevel:       process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                        logTimestamp:   true,
                        autoReconnect:  false,
                        timeout:        main.acp.timeout,
                        unitId:         main.acp.deviceId
                    });
                } catch (e) {
                    adapter.log.error('Cannot connect to "' + main.acp.bind + ':' + parseInt(main.acp.port, 10) || 502 + '": ' + e);
                }
            } else if (main.acp.type === 'serial') {
                if (!main.acp.comName) {
                    adapter.log.error('Serial devicename is not defined');
                    return;
                }
                try {
                    client = {
                        serial      : {
                            core        : require(__dirname + '/lib/modbus-serial-client.js'),
                            complete    : require(__dirname + '/lib/modbus-serial-client.js')
                        },
                        handler     : { }
                    };
                    fs = fs || require('fs');
                    path = __dirname + '/node_modules/jsmodbus';
                    if (!fs.existsSync(__dirname + '/node_modules/jsmodbus')) {
                        path = __dirname + '/../jsmodbus';
                    }

                    fs.readdirSync(path + '/src/handler/client')
                        .filter(function (file) {
                            return file.substr(-3) === '.js';
                        }).forEach(function (file) {

                        client.serial.complete = client.serial.complete.compose(require(path + '/src/handler/client/' + file));
                        client.handler[file.substr(0, file.length - 3)] = require(path + '/src/handler/client/' + file);
                    });

                    modbusClient = client.serial.complete({
                        portName:       main.acp.comName,
                        baudRate:       parseInt(main.acp.baudRate, 10) || 9600,
                        logEnabled:     true,
                        logLevel:       process.argv[3] === 'debug' ? 'verbose' : process.argv[3],
                        logTimestamp:   true,
                        dataBits:       parseInt(main.acp.dataBits, 10) || 8,
                        stopBits:       parseInt(main.acp.stopBits, 10) || 1,
                        timeout:        main.acp.timeout,
                        parity:         main.acp.parity || 'none',
                        unitId:         main.acp.deviceId
                    });
                } catch (e) {
                    adapter.log.error('Cannot open port "' + main.acp.comName + '" [' + (parseInt(main.acp.baudRate, 10) || 9600) + ']: ' + e);
                }
            } else {
                adapter.log.error('Unsupported type "' + main.acp.type + '"');
                return;
            }

            if (!modbusClient) {
                adapter.log.error('Cannot create modbus master!');
                return;
            }
            modbusClient.on('connect', function () {
                if (!connected) {
                    if (main.acp.type === 'tcp') {
                        adapter.log.info('Connected to slave ' + main.acp.bind);
                    } else {
                        adapter.log.info('Connected to slave');
                    }
                    connected = true;
                    adapter.setState('info.connection', true, true);
                }
                main.poll();
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
                    main.reconnect();
                }, 1000);
            });

            modbusClient.on('trashCurrentRequest', function (err) {
                if (isStop) return;
                adapter.log.warn('Error: ' + JSON.stringify(err));
                setTimeout(function () {
                    main.reconnect();
                }, 1000);
            });
            if (typeof modbusClient.connect === 'function') modbusClient.connect();
        }
    },

    pollDisInputs:         function (callback) {
        if (main.disInputsLength) {
            modbusClient.readDiscreteInputs(main.disInputsLowAddress, main.disInputsLength).then(function (registers) {
                for (var n = 0; main.disInputs.length > n; n++) {
                    var id = main.disInputs[n].id;
                    var val = registers.coils[main.disInputs[n].address - main.disInputsLowAddress];

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, !!val, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
                callback();
            }).fail(function (err) {
                callback(err);
            });
        } else {
            callback();
        }
    },
    pollCoils:             function (callback) {
        if (main.coilsLength) {
            modbusClient.readCoils(main.coilsLowAddress, main.coilsLength).then(function (registers) {
                for (var n = 0; main.coils.length > n; n++) {
                    var id = main.coils[n].id;
                    var val = registers.coils[main.coils[n].address - main.coilsLowAddress];

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, !!val, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
                callback();
            }).fail(function (err) {
                callback(err);
            });
        } else {
            callback();
        }
    },
    pollInputRegsBlock:    function (block, callback) {
        if (block >= main.inputRegsBlocks.length) return callback();

        if (main.inputRegsBlocks[block].startIndex === main.inputRegsBlocks[block].endIndex) {
            main.inputRegsBlocks[block].endIndex++;
        }

        modbusClient.readInputRegisters(main.inputRegsBlocks[block].start, main.inputRegsBlocks[block].count).then(function (buffer) {
            if (buffer.payload && buffer.payload.length) {
                for (var n = main.inputRegsBlocks[block].startIndex; n < main.inputRegsBlocks[block].endIndex; n++) {
                    var id = main.inputRegs[n].id;
                    var val = extractValue(main.inputRegs[n].type, main.inputRegs[n].len, buffer.payload, main.inputRegs[n].address - main.inputRegsBlocks[block].start);
                    if (main.inputRegs[n].type !== 'string') {
                        val = val * main.inputRegs[n].factor + main.inputRegs[n].offset;
                        val = Math.round(val * main.acp.round) / main.acp.round;
                    }
                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, val, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
            } else {
                adapter.log.warn('Null buffer length READ_INPUT_REGISTERS for register ' + main.inputRegsBlocks[block].start);
            }
            setTimeout(function () {
                main.pollInputRegsBlock(block + 1, callback);
            }, 0);
        }).fail(function (err) {
            callback(err);
        });
    },
    pollInputRegsBlocks:   function (callback) {
        if (main.inputRegsLength) {
            main.pollInputRegsBlock(0, function (err) {
                callback(err);
            });
        } else {
            callback();
        }
    },
    pollHoldingRegsBlock:  function (block, callback) {
        if (block >= main.holdingRegsBlocks.length) return callback();

        if (main.holdingRegsBlocks[block].startIndex === main.holdingRegsBlocks[block].endIndex) {
            main.holdingRegsBlocks[block].endIndex++;
        }

        modbusClient.readHoldingRegisters(main.holdingRegsBlocks[block].start, main.holdingRegsBlocks[block].count).then(function (buffer) {
            if (buffer.payload && buffer.payload.length) {
                for (var n = main.holdingRegsBlocks[block].startIndex; n < main.holdingRegsBlocks[block].endIndex; n++) {
                    var id = main.holdingRegs[n].id;
                    var val = extractValue(main.holdingRegs[n].type, main.holdingRegs[n].len, buffer.payload, main.holdingRegs[n].address - main.holdingRegsBlocks[block].start);
                    if (main.holdingRegs[n].type !== 'string') {
                        val = val * main.holdingRegs[n].factor + main.holdingRegs[n].offset;
                        val = Math.round(val * main.acp.round) / main.acp.round;
                    }

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, val, true, function (err) {
                            // analyse if the state could be set (because of permissions)
                            if (err) adapter.log.error('Can not set state ' + id + ': ' + err);
                        });
                    }
                }
            } else {
                adapter.log.warn('Null buffer length READ_HOLDING_REGISTERS for register ' + main.holdingRegsBlocks[block].start);
            }
            // special case
            if (main.acp.maxBlock < 2 && main.holdingRegs[main.holdingRegsBlocks[block].startIndex].cw) {
                // write immediately the current value
                main.writeCyclicHoldingReg(objects[main.holdingRegs[main.holdingRegsBlocks[block].startIndex].fullId], function () {
                    main.pollHoldingRegsBlock(block + 1, callback);
                });
            } else {
                setTimeout(function () {
                    main.pollHoldingRegsBlock(block + 1, callback);
                }, 0);
            }
        }).fail(function (err) {
            callback(err);
        });
    },
    pollHoldingRegsBlocks: function (callback) {
        if (main.holdingRegsLength) {
            main.pollHoldingRegsBlock(0, function (err) {
                if (main.holdingRegsCyclicWrite.length && main.acp.maxBlock >= 2) {
                    main.writeCyclicHoldingRegs(0, callback);
                } else {
                    callback(err);
                }
            });
        } else {
            callback();
        }
    },

    writeCyclicHoldingReg: function (obj, callback) {
        if (obj.native.len > 1) {
            var buffer = new Buffer(obj.native.len * 2);
            for (var b = 0; b < buffer.length; b++) {
                buffer[b] = main.holdingRegs[(obj.native.address - main.holdingRegsLowAddress) * 2 + b];
            }
            modbusClient.writeMultipleRegisters(obj.native.address, buffer).then(function (response) {
                callback();
            }).fail(function (err) {
                adapter.log.error('Cannot write: ' + JSON.stringify(err));
                callback(err);
            });
        } else {
            callback();
        }
    },
    writeCyclicHoldingRegs: function (i, callback) {
        if (i >= main.holdingRegsCyclicWrite.length) return callback();

        var id = main.holdingRegsCyclicWrite[i];

        main.writeCyclicHoldingReg(objects[id], function () {
            main.writeCyclicHoldingRegs(i + 1, callback);
        });
    },

    pollResult: function (startTime, err) {
        if (err) {
            main.errorCount++;

            adapter.log.warn('Poll error count: ' + main.errorCount + ' code: ' + JSON.stringify(err));
            adapter.setState('info.connection', false, true);

            if (main.errorCount < 6 && connected) {
                setTimeout(main.poll, main.acp.poll);
            } else {
                main.reconnect();
            }
        } else {
            var currentPollTime = (new Date()).valueOf() - startTime;
            if (main.pollTime !== null && main.pollTime !== undefined) {
                if (Math.abs(main.pollTime - currentPollTime) > 100) {
                    main.pollTime = currentPollTime;
                    adapter.setState('info.pollTime', currentPollTime, true);
                }
            } else {
                main.pollTime = currentPollTime;
                adapter.setState('info.pollTime', currentPollTime, true);
            }

            if (main.errorCount > 0) {
                adapter.setState('info.connection', true, true);
                main.errorCount = 0;
            }
            nextPoll = setTimeout(main.poll, main.acp.poll);
        }
    },

    poll: function () {
        var startTime = (new Date()).valueOf();
        main.requestTimer = setTimeout(function () {
            main.pollResult(startTime, 'App Timeout');
        }, main.acp.timeout + 200);

        main.pollDisInputs(function (err) {
            if (err) return main.pollResult(startTime, err);
            main.pollCoils(function (err) {
                if (err) return main.pollResult(startTime, err);
                main.pollInputRegsBlocks(function (err) {
                    if (err) return main.pollResult(startTime, err);
                    main.pollHoldingRegsBlocks(function (err) {
                        clearTimeout(main.requestTimer);
                        main.requestTimer = null;
                        main.pollResult(startTime, err);
                    });
                });
            });
        });
    }
};

function sortByAddress(a, b) {
    var ad = parseFloat(a.address);
    var bd = parseFloat(b.address);
    return ((ad < bd) ? -1 : ((ad > bd) ? 1 : 0));
}
