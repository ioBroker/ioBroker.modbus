/* jshint -W097 */// jshint strict:false
/* jslint node: true */

"use strict";

var utils         = require(__dirname + '/lib/utils');
var modbus        = require('modbus-stack');
var adapter       = utils.adapter('modbus');
var Binary        = require(__dirname + '/node_modules/modbus-stack/node_modules/bufferlist/binary').Binary;
var Put           = require(__dirname + '/node_modules/modbus-stack/node_modules/put');
var modbusClient  = null; //Master
var modbusServer  = null; //Slave
var connected     = 0;
var connectTimer  = null;

var nextPoll;
var ackObjects    = {};

process.on('SIGINT', function () {
    if (adapter && adapter.setState) {
        if (modbusClient) {
            modbusClient.destroy();
        }
        if (modbusServer) {
            modbusServer.close();
        }
        adapter.setState('info.connection', 0, true);
    }
    if (nextPoll)  {
        clearTimeout(nextPoll);
    }
});

adapter.on('ready', function () {
    adapter.setState('info.connection', 0, true);
    main.main();
});

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

function writeHelper(id, state) {
    sendBuffer[id] = state.val;

    if (Object.keys(sendBuffer).length == 1) send();
}

function prepareWrite(id, state) {
    if (objects[id].native.float === undefined) {
        objects[id].native.float =
            objects[id].native.type === 'floatle'  || objects[id].native.type === 'floatbe' ||
            objects[id].native.type === 'doublele' || objects[id].native.type === 'doublebe';
    }

    if (main.acp.slave) {
        var t = typeof state.val;
        if (objects[id].native.regType == 'disInputs') {
            if (t === 'boolean' || t === 'number') {
                main.disInputs[objects[id].native.address - main.disInputsLowAddress] = state.val ? 1 : 0;
            } else {
                main.disInputs[objects[id].native.address - main.disInputsLowAddress] = parseInt(state.val, 10) ? 1 : 0;
            }
        } else if (objects[id].native.regType == 'coils') {
            if (t === 'boolean' || t === 'number') {
                main.coils[objects[id].native.address - main.coilsLowAddress] = state.val ? 1 : 0;
            } else {
                main.coils[objects[id].native.address - main.coilsLowAddress] = parseInt(state.val, 10) ? 1 : 0;
            }
        } else if (objects[id].native.regType == 'inputRegs') {
            var val;
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
            var buffer = writeValue(objects[id].native.type, val, objects[id].native.len);
            for (var b = 0; b < buffer.length; b++) {
                main.inputRegs[(objects[id].native.address - main.inputRegsLowAddress) * 2 + b] = buffer[b];
            }
        } else if (objects[id].native.regType == 'holdingRegs') {
            var val;
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
            var buffer = writeValue(objects[id].native.type, val, objects[id].native.len);
            for (var b = 0; b < buffer.length; b++) {
                main.holdingRegs[(objects[id].native.address - main.holdingRegsLowAddress) * 2 + b] = buffer[b];
            }
        } else {
            adapter.log.error('Unknown state "' + id + '" type: ' + objects[id].native.regType);
        }
    } else {
        if (objects[id].native.regType == 'coils' || objects[id].native.regType == 'holdingRegs') {

            if (!objects[id].native.wp) {

                writeHelper(id, state);
                setTimeout(function () {
                    var _id = id.substring(adapter.namespace.length + 1);
                    adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true);
                }, main.acp.poll * 1.5);

            } else {
                if (pulseList[id] === undefined) {
                    var _id = id.substring(adapter.namespace.length + 1);
                    pulseList[id] = ackObjects[_id] ? ackObjects[_id].val : !state.val;

                    setTimeout(function () {
                        writeHelper(id, {val: pulseList[id]});

                        setTimeout(function () {
                            if (ackObjects[_id]) {
                                adapter.setState(id, ackObjects[_id].val, true);
                            }
                            delete pulseList[id];
                        }, main.acp.poll * 1.5);

                    }, adapter.config.params.pulsetime);

                    writeHelper(id, state);
                }
            }
        } else {
            setTimeout(function () {
                var _id = id.substring(adapter.namespace.length + 1);
                adapter.setState(id, ackObjects[_id] ? ackObjects[_id].val : null, true);
            }, 0);
        }
    }
}



function send() {
    var id = Object.keys(sendBuffer)[0];

    var type = objects[id].native.regType;
    var val  = sendBuffer[id];

    if (type == 'coils') {
        if (val === 'true'  || val === true)  val = 1;
        if (val === 'false' || val === false) val = 0;
        val = parseFloat(val);

        modbusClient.request(modbus.FUNCTION_CODES.WRITE_SINGLE_COIL, objects[id].native.address, val ? true : false, function (err, response) {
            if (err) {
                adapter.log.error(err);
            } else {
                adapter.log.debug('Write successfully [' + objects[id].native.address + ': ' + val);
            }
        });
    } else if (type == 'holdingRegs') {
        if (objects[id].native.float === undefined) {
            objects[id].native.float =
                objects[id].native.type === 'floatle'  || objects[id].native.type === 'floatbe' ||
                objects[id].native.type === 'doublele' || objects[id].native.type === 'doublebe';
        }

        if (objects[id].native.type !== 'string') {
            val = parseFloat(val);
            val = (val - objects[id].native.offset) / objects[id].native.factor;
            if (!objects[id].native.float) val = Math.round(val);
        }
        if (objects[id].native.len > 1) {
            var buffer = writeValue(objects[id].native.type, val, objects[id].native.len);
            modbusClient.request(modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS, objects[id].native.address, buffer, function (err, response) {
                if (err) {
                    adapter.log.error('Cannot write: ' + err);
                } else {
                    adapter.log.debug('Write successfully [' + objects[id].native.address + ': ' + val);
                }
            });
        } else {
            modbusClient.request(modbus.FUNCTION_CODES.WRITE_SINGLE_REGISTER, objects[id].native.address, val, function (err, response) {
                if (err) {
                    adapter.log.error(err);
                } else {
                    adapter.log.debug('Write successfully [' + objects[id].native.address + ': ' + val);
                }
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
            if (pos == -1) {
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
            if (pos != -1) {
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
    for (var e in enums[enumGroup]) {
        if (enums[enumGroup][e].common &&
            enums[enumGroup][e].common.members &&
            enums[enumGroup][e].common.members.indexOf(id) != -1) {
            if (enums[enumGroup][e]._id != newEnumName) {
                removeFromEnum(enums[enumGroup][e]._id, id);
            } else {
                found = true;
            }
        }
    }
    if (!found && newEnumName) {
        addToEnum(newEnumName, id);
    }
}

function extractValue (type, len, buffer, offset) {
    switch (type) {
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
        case 'int32be':
            return buffer.readInt32BE(offset * 2);
        case 'int32le':
            return buffer.readInt32LE(offset * 2);
        case 'uint64be':
            return buffer.readUInt32BE(offset * 2) * 0x100000000 + buffer.readUInt32BE(offset * 2 + 4);
        case 'uint64le':
            return buffer.readUInt32LE(offset * 2) + buffer.readUInt32LE(offset * 2 + 4) * 0x100000000;
        case 'int64be':
            var i1 = buffer.readInt32BE(offset * 2);
            var i2 = buffer.readUInt32BE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            } else {
                return i1 * 0x100000000 - i2; // I have no solution for that !
            }
        case 'int64le':
            var i2 = buffer.readUInt32LE(offset * 2);
            var i1 = buffer.readInt32LE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            } else {
                return i1 * 0x100000000 - i2; // I have no solution for that !
            }
        case 'floatbe':
            return buffer.readFloatBE(offset * 2);
        case 'floatle':
            return buffer.readFloatLE(offset * 2);
        case 'doublebe':
            return buffer.readDoubleBE(offset * 2);
        case 'doublele':
            return buffer.readDoubleLE(offset * 2);
        case 'string':
            // find lenght
            var _len = 0;
            while (buffer[offset * 2 + _len] && _len < len * 2) _len++;

            return buffer.toString('ascii', offset * 2, offset * 2 + _len);
        default:
            adapter.log.error('Invalid type: ' + type);
            return 0;
    }
}

function writeValue (type, value, len) {
    var buffer;
    switch (type) {
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
        case 'int32be':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            break;
        case 'int32le':
            buffer = new Buffer(4);
            buffer.writeInt32LE(value, 0);
            break;
        case 'uint64be':
            buffer = new Buffer(8);
            buffer.writeUInt32BE(value >> 32, 0) + buffer.writeUInt32BE(value & 0xFFFFFFFF, 4);
            break;
        case 'uint64le':
            buffer = new Buffer(8);
            buffer.writeUInt32LE(value & 0xFFFFFFFF, 0) + buffer.writeUInt32LE(value >> 32, 4);
            break;
        case 'int64be':
            buffer = new Buffer(8);
            buffer.writeInt32BE(value >> 32, 0) + buffer.writeUInt32BE(value & 0xFFFFFFFF, 4);
            break;
        case 'int64le':
            buffer = new Buffer(8);
            buffer.writeUInt32LE(value & 0xFFFFFFFF, 0) + buffer.writeInt32LE(value >> 32, 4);
            break;
        case 'floatbe':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            break;
        case 'floatle':
            buffer = new Buffer(4);
            buffer.writeFloatLE(value, 0);
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
    'uint16be':   1,
    'uint16le':   1,
    'int16be':    1,
    'int16le':    1,
    'int16be1':   1,
    'int16le1':   1,
    'uint32be':   2,
    'uint32le':   2,
    'int32be':    2,
    'int32le':    2,
    'uint64be':   4,
    'uint64le':   4,
    'int64be':    4,
    'int64le':    4,
    'floatbe':    2,
    'floatle':    2,
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

function address2alias(id, address) {
    if (id == 'disInputs' || id == 'coils') {
        address += main.acp[id + 'Offset'];
        return Math.floor(address / 16) * 16 + _rmap[address % 16];
    } else {
        return address + main.acp[id + 'Offset'];
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

    history:     "",
    unit:        "",
    errorCount: 0,

    main: function () {
        main.ac           = adapter.config;
        main.acp          = adapter.config.params;
        main.acp.poll     = parseInt(main.acp.poll,  10) || 1000; // default is 1 second
        main.acp.recon    = parseInt(main.acp.recon, 10) || 60000;
        main.acp.port     = parseInt(main.acp.port,  10) || 502;
        main.acp.slave    = parseInt(main.acp.slave, 10) || 0;
        main.acp.round    = parseInt(main.acp.round, 10) || 0;
        main.acp.deviceId = (main.acp.deviceId === undefined || main.acp.deviceId === null) ? 1 : (parseInt(main.acp.deviceId, 10) || 0);
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
            var len;
            var lastAddress = null;
            var blockStart;
            var startIndex;

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
                        main.ac.disInputs[i].id += address2alias('disInputs', address);
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
                        main.ac.coils[i].id += address2alias('coils', address);
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
                        main.ac.inputRegs[i].id += address2alias('inputRegs', address);
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
                        if (main.inputRegsBlocks.map(function (obj) {return obj.start;}).indexOf(blockStart) == -1) {
                            main.inputRegsBlocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                        }
                        blockStart  = address;
                        startIndex  = i;
                    }
                    lastAddress = address + main.ac.inputRegs[i].len;
                }
                if (main.inputRegsBlocks.map(function (obj) {return obj.start;}).indexOf(blockStart) == -1) {
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
                        main.ac.holdingRegs[i].id += address2alias('holdingRegs', address);
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
                        if (main.holdingRegsBlocks.map(function (obj) {return obj.start;}).indexOf(blockStart) == -1) {
                            main.holdingRegsBlocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                        }
                        blockStart  = address;
                        startIndex  = i;
                    }
                    lastAddress = address + main.ac.holdingRegs[i].len;
                }
                if (main.holdingRegsBlocks.map(function (obj) {return obj.start;}).indexOf(blockStart) == -1) {
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
                adapter.setObject('discreteInputs', {
                    type: 'channel',
                    common: {
                        name: 'Discrete inputs'
                    },
                    native: {}
                });
            }

            if (main.ac.coils.length > 0) {
                adapter.setObject('coils', {
                    type: 'channel',
                    common: {
                        name: 'Coils'
                    },
                    native: {}
                });
            }

            if (main.ac.inputRegs.length > 0) {
                adapter.setObject('inputRegisters', {
                    type: 'channel',
                    common: {
                        name: 'Input registers'
                    },
                    native: {}
                });
            }

            if (main.ac.holdingRegs.length > 0) {
                adapter.setObject('holdingRegisters', {
                    type: 'channel',
                    common: {
                        name: 'Holding registers'
                    },
                    native: {}
                });
            }

            var id;
            // ------------- create states and objects ----------------------------
            for (i = 0; main.ac.disInputs.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.disInputs[i].id;
                main.ac.disInputs[i].fullId = id;
                objects[id] = {
                    type: 'state',
                    common: {
                        name:    main.ac.disInputs[i].description,
                        role:    main.ac.disInputs[i].role,
                        type:    'boolean',
                        read:    true,
                        write:   false,
                        def:     false,
                        history: main.history
                    },
                    native: {
                        regType:  'disInputs',
                        address:   main.ac.disInputs[i].address
                    }
                };
                adapter.setObject(main.ac.disInputs[i].id, objects[id]);

                syncEnums('rooms', id, main.ac.disInputs[i].room);

                main.newObjects.push(id);
            }

            for (i = 0; main.ac.coils.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.coils[i].id;
                main.ac.coils[i].fullId = id;
                objects[id] = {
                    type: 'state',
                    common: {
                        name:    main.ac.coils[i].description,
                        role:    main.ac.coils[i].role,
                        type:    'boolean',
                        read:    true,
                        write:   true,
                        def:     false,
                        history: main.history
                    },
                    native: {
                        regType:   'coils',
                        address:   main.ac.coils[i].address,
                        poll:      main.ac.coils[i].poll,
                        wp:        main.ac.coils[i].wp
                    }
                };
                adapter.setObject(main.ac.coils[i].id, objects[id]);
                syncEnums('rooms', id, main.ac.coils[i].room);
                main.newObjects.push(id);
            }

            for (i = 0; main.ac.inputRegs.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.inputRegs[i].id;
                main.ac.inputRegs[i].fullId = id;
                objects[id] = {
                    type: 'state',
                    common: {
                        name:    main.ac.inputRegs[i].description,
                        type:    'number',
                        read:    true,
                        write:   false,
                        def:     0,
                        role:    main.ac.inputRegs[i].role,
                        unit:    main.ac.inputRegs[i].unit || '',
                        history: main.history
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
                adapter.setObject(main.ac.inputRegs[i].id, objects[id]);

                syncEnums('rooms', id, main.ac.inputRegs[i].room);

                main.newObjects.push(id);
            }

            for (i = 0; main.ac.holdingRegs.length > i; i++) {
                id = adapter.namespace + '.' + main.ac.holdingRegs[i].id;
                main.ac.holdingRegs[i].fullId = id;
                objects[id] = {
                    type: 'state',
                    common: {
                        name:    main.ac.holdingRegs[i].description,
                        type:    'number',
                        read:    true,
                        write:   true,
                        def:     0,
                        role:    main.ac.holdingRegs[i].role,
                        unit:    main.ac.holdingRegs[i].unit || '',
                        history: main.history
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

                adapter.setObject(main.ac.holdingRegs[i].id, objects[id]);

                syncEnums('rooms', id, main.ac.holdingRegs[i].room);

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
                            adapter.setState(id, 0, true);
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
                            adapter.setState(id, 0, true);
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
                            adapter.setState(id, 0, true);
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
                            adapter.setState(id, 0, true);
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

            adapter.setObject("info", {
                type: 'channel',
                common: {
                    name:    "info"
                },
                native: {}
            });

            if (!main.acp.slave) {
                adapter.setObject('info.pollTime', {
                    type: 'state',
                    common: {
                        name: "Poll time",
                        type: 'number',
                        role: '',
                        write: false,
                        read:  true,
                        def:   0,
                        unit: 'ms'
                    },
                    native: {}
                });
                main.newObjects.push(adapter.namespace + ".info.pollTime");
            }

            adapter.setObject('info.connection', {
                type: 'state',
                common: {
                    name:  'Number of connected partners',
                    role:  'indicator.connection',
                    write: false,
                    read:  true,
                    def:   0,
                    type:  'number'
                },
                native: {}
            });
            main.newObjects.push(adapter.namespace + '.info.connection');

            adapter.setState('info.connection', 0, true);

            // clear unused states
            var l = main.oldObjects.length;

            function clear() {
                for (var id in main.oldObjects) {
                    if (main.newObjects.indexOf(id) == -1) {
                        adapter.delObject(id, function () {

                        });
                    }
                }

                main.oldObjects = [];
                main.newObjects = [];
                adapter.subscribeStates('*');
                main.start();
            }

            clear();
        });
    },

    reconnect: function () {
        if (connected) {
            adapter.log.info('Disconnected from slave ' + main.acp.bind);
            connected = 0;
            adapter.setState('info.connection', 0, true);
        }
        if (!connectTimer) {
            connectTimer = setTimeout(function () {
                connectTimer = null;
                modbusClient.connect(main.acp.port, main.acp.bind);
            }, main.acp.recon);
        }
    },
    start: function () {

        if (main.acp.slave) {
            var handlers = {};

            // read all states first time
            var Server = require('modbus-stack/server');

            // override on connect
            Server.prototype._setupConn = function (socket) {
                var self = this;
                modbus.ModbusRequestStack.prototype.unitIdentifier  = main.acp.deviceId;
                var response = new modbus.ModbusResponseStack(socket);
                response.on('request', function (request) {
                    self.emit('request', request, response);
                    if (socket.readable && socket.writable) {
                        self._setupConn(socket);
                    }
                }).on('error', function (err) {
                    self.emit('error', err);
                });
            };
            
            Server.RESPONSES[modbus.FUNCTION_CODES.READ_HOLDING_REGISTERS] = function (registers) {
                var put = new Put().word8(registers.length);

                for (var i = 0, l = registers.length; i < l; i++) {
                    put.word8(registers[i]);
                }
                return put.buffer();
            };
            Server.RESPONSES[modbus.FUNCTION_CODES.READ_INPUT_REGISTERS] = Server.RESPONSES[modbus.FUNCTION_CODES.READ_HOLDING_REGISTERS];
            Server.RESPONSES[modbus.FUNCTION_CODES.READ_DISCRETE_INPUTS] = function (registers) {
                var put = new Put().word8(registers.length);

                for (var i = 0, l = registers.length; i < l; i += 2) {
                    put.word16be((registers[i] << 8) + registers[i + 1]);
                }
                return put.buffer();
            };
            Server.RESPONSES[modbus.FUNCTION_CODES.READ_COILS] = Server.RESPONSES[modbus.FUNCTION_CODES.READ_DISCRETE_INPUTS];
            Server.RESPONSES[modbus.FUNCTION_CODES.WRITE_SINGLE_COIL] = function (registers) {
                var put = new Put().word16be(registers.address);
                put.word16be(registers.value ? 0xFF00 : 0);
                return put.buffer();
            };
            Server.RESPONSES[modbus.FUNCTION_CODES.WRITE_SINGLE_REGISTER] = function (registers) {
                var res = new Buffer(2);
                res.startAddress = registers.address;
                res[0] = (registers.value >> 8);
                res[0] = (registers.value & 0xFF);
                return res;
            };
            Server.RESPONSES[modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS] = function (registers) {
                var put = new Put().word16be(registers.address);
                put.word16be(registers.quantity);
                return put.buffer();
            };
            Server.REQUESTS[modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS] = function (bufferlist) {
                var binary = Binary(bufferlist);
                var startAddress = binary.getWord16be('startAddress').end().vars.startAddress;
                var quantity = binary.getWord16be('quantity').end().vars.quantity;
                var bytes = binary.getWord8('bytes').end().vars.bytes;
                var res = new Buffer(bytes);
                res.startAddress = startAddress;
                res.quantity = quantity;
                for (var i = 0; i < bytes; i++) {
                    res[i] = binary.getWord8('val').end().vars.val;
                }
                return res;
            };

            handlers[modbus.FUNCTION_CODES.READ_DISCRETE_INPUTS] = function (request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(Math.ceil(length / 16) * 2);

                var i = 0;
                for (var j = 0; j < resp.length; j++) {
                    resp[j] = 0;
                }
                while (i < length && i + start <= main.disInputsHighAddress) {
                    if (main.disInputs[i + start - main.disInputsLowAddress]) {
                        resp[Math.floor(i / 8)] |= 1 << (i % 8);
                    }
                    i++;
                }


                response.writeResponse(resp);
            };
            handlers[modbus.FUNCTION_CODES.READ_COILS] = function (request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                //console.log(new Date() + 'READ_COILS [' +  start + ']: ' + length);
                var resp = new Array(Math.ceil(length / 16) * 2);
                var i = 0;
                for (var j = 0; j < resp.length; j++) {
                    resp[j] = 0;
                }
                while (i < length && i + start <= main.coilsHighAddress) {
                    if (main.coils[i + start - main.coilsLowAddress]) {
                        resp[Math.floor(i / 8)] |= 1 << (i % 8);
                    }
                    i++;
                }

                response.writeResponse(resp);
            };
            handlers[modbus.FUNCTION_CODES.READ_HOLDING_REGISTERS] = function (request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length * 2);
                var i = 0;
                while (i < length && i + start < main.holdingRegsLowAddress) {
                    resp[i * 2] = 0;
                    resp[i * 2 + 1] = 0;
                    i++;
                }
                var a;
                while (i < length && i + start <= main.holdingRegsHighAddress) {
                    a = i + start - main.holdingRegsLowAddress;
                    resp[i * 2 + 0] = main.holdingRegs[a * 2 + 0];
                    resp[i * 2 + 1] = main.holdingRegs[a * 2 + 1];
                    i++;
                }
                if (i > main.holdingRegsHighAddress) {
                    while (i < length) {
                        resp[i * 2] = 0;
                        resp[i * 2 + 1] = 0;
                        i++;
                    }
                }

                response.writeResponse(resp);
            };
            handlers[modbus.FUNCTION_CODES.READ_INPUT_REGISTERS] = function (request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length * 2);
                var i = 0;
                while (i < length && i + start < main.inputRegsLowAddress) {
                    resp[i * 2 + 0] = 0;
                    resp[i * 2 + 1] = 0;
                    i++;
                }
                var a;
                while (i < length && i + start <= main.inputRegsHighAddress) {
                    a = i + start - main.inputRegsLowAddress;
                    resp[i * 2 + 0] = main.inputRegs[a * 2 + 0];
                    resp[i * 2 + 1] = main.inputRegs[a * 2 + 1];
                    i++;
                }
                if (i > main.inputRegsHighAddress) {
                    while (i < length) {
                        resp[i * 2 + 0] = 0;
                        resp[i * 2 + 1] = 0;
                        i++;
                    }
                }

                response.writeResponse(resp);
            };
            handlers[modbus.FUNCTION_CODES.WRITE_SINGLE_COIL] = function (request, response) {
                var a = request.address - main.coilsLowAddress;
                adapter.log.debug('WRITE_SINGLE_COIL [' + (main.coilsMapping[a] ? main.coilsMapping[a] : request.address) + ']: ' + request.value);
                if (main.coilsMapping[a]) {
                    adapter.setState(main.coilsMapping[a], request.value, true);
                    main.coils[a] = request.value;
                }

                response.writeResponse(response);
            };
            handlers[modbus.FUNCTION_CODES.WRITE_SINGLE_REGISTER] = function (request, response) {
                var a = request.startAddress - main.holdingRegsLowAddress;
                adapter.log.debug('WRITE_SINGLE_REGISTER [' +  (main.holdingRegsMapping[a] ? main.holdingRegsMapping[a] : request.startAddress) + ']: ' + request.value);
                if (main.holdingRegsMapping[a]) {
                    var native = objects[main.holdingRegsMapping[a]].native;
                    var val = extractValue(native.type, native.len, request, 0);
                    if (native.type !== 'string') {
                        val = (val - native.offset) / native.factor;
                        val = Math.round(val * main.acp.round) / main.acp.round;
                    }
                    adapter.setState(main.holdingRegsMapping[a], val, true);
                    main.holdingRegs[a] = val;
                }

                response.writeResponse(request);
            };
            /*handlers[modbus.FUNCTION_CODES.WRITE_MULTIPLE_COILS] = function (request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var i = 0;
                while (i < length && i + start <= main.coilsLowAddress) {
                    var a = (i + start - main.coilsLowAddress);
                    if (main.coilsMapping[a]) {
                        adapter.setState(main.coilsMapping[a], request[i].value, true);
                        main.coils[a] = request[i].value;
                    }
                    i++;
                }

                response.writeResponse(request);
            };*/
            handlers[modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS] = function (request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var i = 0;
                while (i < length && i + start <= main.holdingRegsLowAddress) {
                    var a = i + start - main.holdingRegsLowAddress;
                    if (main.holdingRegsMapping[a]) {
                        var native = objects[main.holdingRegsMapping[a]].native;
                        var val = extractValue(native.type, native.len, request, a * 2);
                        if (native.type != 'string') {
                            val = val * native.factor + native.offset;
                            val = Math.round(val * main.acp.round) / main.acp.round;
                        }
                        adapter.setState(main.holdingRegsMapping[a], val, true);
                        for (var i = 0; i < native.len * 2; i++) {
                            main.holdingRegs[a * 2 + i] = request[i];
                        }
                        i += native.len;
                    } else {
                        i++;
                    }
                }

                response.writeResponse(request);
            };

            modbusServer = Server.createServer(handlers).listen(main.acp.port);
            modbusServer.on('connection', function (client) {
                connected++;
                adapter.log.info('Clients connected: ' + modbusServer._connections);
                adapter.setState('info.connection', modbusServer._connections, true);
            }).on('close', function (client) {
                adapter.setState('info.connection', modbusServer._connections, true);
            }).on('error', function (err) {
                adapter.log.info('Clients connected: ' + modbusServer._connections);
                adapter.setState('info.connection', modbusServer._connections, true);
                adapter.log.warn(err);
            });

        } else {
            var Client = require('modbus-stack/client');
            Client.RESPONSES[modbus.FUNCTION_CODES.READ_DISCRETE_INPUTS] = function (bufferlist) {
                var rtn = [];
                var binary = new Binary(bufferlist).getWord8('byteLength').end();
                rtn.byteLength = binary.vars.byteLength;
                var i;
                var l;
                var val;
                var val1;
                var b;
                for (i = 0, l = Math.floor(binary.vars.byteLength / 2); i < l; i++) {
                    binary.getWord16be('val');
                    val = binary.end().vars.val;
                    val1 = val & 0xFF;
                    for (b = 0; b < 8; b++) {
                        rtn[i * 16 + (7 - b)] = (((val1 >> b) & 1) ? true : false);
                    }
                    val1 = val >> 8;
                    for (b = 0; b < 7; b++) {
                        rtn[i * 16 + 15 - b] = (((val1 >> b) & 1) ? true : false);
                    }
                }
                // read last byte
                if (i * 2 < binary.vars.byteLength) {
                    binary.getWord8('val');
                    val = binary.end().vars.val;
                    for (b = 0; b < 8; b++) {
                        rtn[i * 16 + (7 - b)] = (((val1 >> b) & 1) ? true : false);
                    }
                }
                return rtn;
            };
            Client.RESPONSES[modbus.FUNCTION_CODES.READ_COILS] = Client.RESPONSES[modbus.FUNCTION_CODES.READ_DISCRETE_INPUTS];
            Client.RESPONSES[modbus.FUNCTION_CODES.READ_INPUT_REGISTERS] = function (bufferlist) {
                var binary = new Binary(bufferlist).getWord8('byteLength').end();
                var rtn = new Buffer(binary.vars.byteLength);
                //rtn.byteLength = binary.vars.byteLength;
                for (var i = 0, l = binary.vars.byteLength; i < l; i++) {
                    binary.getWord8('val');
                    rtn[i] = binary.end().vars.val;
                }
                return rtn;
            };
            Client.RESPONSES[modbus.FUNCTION_CODES.READ_HOLDING_REGISTERS] = Client.RESPONSES[modbus.FUNCTION_CODES.READ_INPUT_REGISTERS];
            Client.RESPONSES[modbus.FUNCTION_CODES.WRITE_SINGLE_COIL] = function (address, value) {
                return new Put()
                    .word16be(address)
                    .word16be(value ? 0xFF00 : 0)
                    .buffer();
            };
            Client.REQUESTS[modbus.FUNCTION_CODES.WRITE_SINGLE_REGISTER] = function (address, value) {
                return new Put()
                    .word16be(address)
                    .word16be(value)
                    .buffer();
            };
            Client.REQUESTS[modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS] = function (address, buffer) {
                var p = new Put().word16be(address).word16be(Math.ceil(buffer.length / 2)).word8(buffer.length);
                for (var i = 0; i < buffer.length; i++) {
                    p.word8(buffer[i]);
                }
                return p.buffer();
            };
            Client.RESPONSES[modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS] = function (bufferlist) {
                return {};
            };
            Client.RESPONSES[modbus.FUNCTION_CODES.WRITE_SINGLE_REGISTER] = function (bufferlist) {
                return {};
            };
            // override request
            Client.prototype.request = function() {
                var req = new modbus.ModbusRequestStack(this);
                req.unitIdentifier  = main.acp.deviceId;
                req.request.apply(req, arguments);
                return req;
            }
            modbusClient = Client.createClient(main.acp.port, main.acp.bind);

            modbusClient.on('connect', function () {
                if (!connected) {
                    adapter.log.info('Connected to slave ' + main.acp.bind);
                    connected = 1;
                    adapter.setState('info.connection', 1, true);
                }
                main.poll();
            }).on('disconnect', function () {
                main.reconnect();
            });

            modbusClient.on('error', function (err) {
                adapter.log.warn(err);
                main.reconnect();
            });
        }
    },

    pollDisInputs: function (callback) {
        if (main.disInputsLength) {
            modbusClient.request(modbus.FUNCTION_CODES.READ_DISCRETE_INPUTS, main.disInputsLowAddress, main.disInputsLength, function (err, registers) {
                if (err) {
                    callback(err);
                } else {
                    for (var n = 0; main.disInputs.length > n; n++) {
                        var id = main.disInputs[n].id;
                        var val = registers[main.disInputs[n].address - main.disInputsLowAddress];

                        if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                            ackObjects[id] = {val: val};
                            adapter.setState(id, val ? true : false, true);
                        }
                    }
                    callback(null);
                }
            });
        } else {
            callback(null);
        }
    },
    pollCoils: function (callback) {
        if (main.coilsLength) {
            modbusClient.request(modbus.FUNCTION_CODES.READ_COILS, main.coilsLowAddress, main.coilsLength, function (err, registers) {
                if (err) {
                    callback(err);
                } else {
                    for (var n = 0; main.coils.length > n; n++) {
                        var id = main.coils[n].id;
                        var val = registers[main.coils[n].address - main.coilsLowAddress];

                        if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                            ackObjects[id] = {val: val};
                            adapter.setState(id, val ? true : false, true);
                        }
                    }
                    callback(null);
                }
            });
        } else {
            callback(null);
        }
    },
    pollInputRegsBlock:    function (block, callback) {
        if (block >= main.inputRegsBlocks.length) {
            return callback(null);
        }
        modbusClient.request(
            modbus.FUNCTION_CODES.READ_INPUT_REGISTERS,
            main.inputRegsBlocks[block].start,
            main.inputRegsBlocks[block].count,
            function (err, buffer) {
                if (err) {
                    callback(err);
                } else {
                    for (var n = main.inputRegsBlocks[block].startIndex; n < main.inputRegsBlocks[block].endIndex; n++) {
                        var id = main.inputRegs[n].id;
                        var val = extractValue(main.inputRegs[n].type, main.inputRegs[n].len, buffer, main.inputRegs[n].address - main.inputRegsBlocks[block].start);
                        if (main.inputRegs[n].type !== 'string') {
                            val = val * main.inputRegs[n].factor + main.inputRegs[n].offset;
                            val = Math.round(val * main.acp.round) / main.acp.round;
                        }
                        if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                            ackObjects[id] = {val: val};
                            adapter.setState(id, val, true);
                        }
                    }
                    setTimeout(function () {
                        main.pollInputRegsBlock(block + 1, callback);
                    }, 0);
                }
            }
        );
    },
    pollInputRegsBlocks:   function (callback) {
        if (main.inputRegsLength) {
            main.pollInputRegsBlock(0, function (err) {
                callback(err);
            });
        } else {
            callback(null);
        }
    },
    pollHoldingRegsBlock:  function (block, callback) {
        if (block >= main.holdingRegsBlocks.length) {
            return callback(null);
        }
        modbusClient.request(modbus.FUNCTION_CODES.READ_HOLDING_REGISTERS,
            main.holdingRegsBlocks[block].start,
            main.holdingRegsBlocks[block].count,
            function (err, buffer) {
            if (err) {
                callback(err);
            } else {
                for (var n = main.holdingRegsBlocks[block].startIndex; n < main.holdingRegsBlocks[block].endIndex; n++) {
                    var id = main.holdingRegs[n].id;
                    var val = extractValue(main.holdingRegs[n].type, main.holdingRegs[n].len, buffer, main.holdingRegs[n].address - main.holdingRegsBlocks[block].start);
                    if (main.holdingRegs[n].type !== 'string') {
                        val = val * main.holdingRegs[n].factor + main.holdingRegs[n].offset;
                        val = Math.round(val * main.acp.round) / main.acp.round;
                    }

                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                        ackObjects[id] = {val: val};
                        adapter.setState(id, val, true);
                    }
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
            }
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
            callback(null);
        }
    },
    writeCyclicHoldingReg: function (obj, callback) {
        if (obj.native.len > 1) {
            var buffer = new Buffer(obj.native.len * 2);
            for (var b = 0; b < buffer.length; b++) {
                buffer[b] = main.holdingRegs[(obj.native.address - main.holdingRegsLowAddress) * 2 + b];
            }
            modbusClient.request(modbus.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS, obj.native.address, buffer, function (err, response) {
                if (err) {
                    adapter.log.error('Cannot write: ' + err);
                }
                callback(err);
            });
        } else {
            var addr = (obj.native.address - main.holdingRegsLowAddress) * 2;
            var val = (main.holdingRegs[addr] << 8) + main.holdingRegs[addr + 1];
            modbusClient.request(modbus.FUNCTION_CODES.WRITE_SINGLE_REGISTER, obj.native.address, val, function (err, response) {
                if (err) {
                    adapter.log.error(err);
                }
                callback(err);
            });
        }
    },
    writeCyclicHoldingRegs:      function (i, callback) {
        if (i >= main.holdingRegsCyclicWrite.length) {
            return callback(null);
        }
        var id = main.holdingRegsCyclicWrite[i];

        main.writeCyclicHoldingReg(objects[id], function () {
            main.writeCyclicHoldingRegs(i + 1, callback);
        });
    },

    pollResult: function (startTime, err) {
        if (err) {
            main.errorCount++;

            adapter.log.warn('Poll error count: ' + main.errorCount + ' code: ' + err);
            adapter.setState('info.connection', 0, true);

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
                adapter.setState('info.connection', 1, true);
                main.errorCount = 0;
            }
            nextPoll = setTimeout(main.poll, main.acp.poll);
        }
    },

    poll: function () {
        var startTime = (new Date()).valueOf();

        main.pollDisInputs(function (err) {
            if (err) return main.pollResult(startTime, err);
            main.pollCoils(function (err) {
                if (err) return main.pollResult(startTime, err);
                main.pollInputRegsBlocks(function (err) {
                    if (err) return main.pollResult(startTime, err);
                    main.pollHoldingRegsBlocks(function (err) {
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

