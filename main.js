/* jshint -W097 */// jshint strict:false
/* jslint node: true */

'use strict';

const utils       = require(__dirname + '/lib/utils');
let modbus        = null;

let serialport    = null;

let adapter       = utils.Adapter({
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
    if (adapter && adapter.setState) {
        if (modbus) {
            modbus.close();
            modbus = null;
        }

        if (adapter.config && adapter.config.params) {
            adapter.setState('info.connection', adapter.config.params.slave ? 0 : false, true);
        }
    }

    if (callback) callback();
}

let objects    = {};
let enums      = {};
let infoRegExp = new RegExp(adapter.namespace.replace('.', '\\.') + '\\.info\\.');

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
    const path = require('path');
    const fs      = require('fs');

    // Filter out the devices that aren't serial ports
    let devDirName = '/dev';

    let result;
    try {
        result = fs
            .readdirSync(devDirName)
            .map(function (file) {
                return path.join(devDirName, file);
            })
            .filter(filterSerialPorts)
            .map(function (port) {
                let found = false;
                for (let v = 0; v < ports.length; v++) {
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

function addToEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, function (err, obj) {
        if (!err && obj) {
            let pos = obj.common.members.indexOf(id);
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
            let pos = obj.common.members.indexOf(id);
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
    let found = false;
    let count = 0;
    for (let e in enums[enumGroup]) {
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

const type_items_len = {
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

const _rmap = {
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
const _dmap = {
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
    let task = tasks.shift();
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

function prepareConfig(params) {
    params.slave = parseInt(params.slave, 10) || 0; // required in stop

    let options = {
        config: {
            type:               params.type || 'tcp',
            slave:              params.slave,
            round:              parseInt(params.round, 10) || 0,
            timeout:            parseInt(params.timeout, 10) || 5000,
            defaultDeviceId:   (params.deviceId === undefined || params.deviceId === null) ? 1 : (parseInt(params.deviceId, 10) || 0),
        }
    };

    // settings for master
    if (!options.config.slave) {
        options.config.poll      = parseInt(params.poll, 10)     || 1000; // default is 1 second
        options.config.recon     = parseInt(params.recon, 10)    || 60000;
        options.config.maxBlock  = parseInt(params.maxBlock, 10) || 100;
        options.config.pulsetime = parseInt(params.pulsetime     || 1000);
    }

    if (options.config.slave || params.type === 'tcp' || params.type === 'tcprtu') {
        options.config.tcp = {
            port: parseInt(params.port, 10) || 502,
            bind: params.bind
        };
    } else {
        options.config.serial = {
            comName:    params.comName,
            baudRate:   params.baudRate,
            dataBits:   params.dataBits,
            stopBits:   params.stopBits,
            parity:     params.parity
        };
    }
    
    if (options.config.slave) {
        options.coils = {
            fullIds:       [],
            changed:       true,
            addressHigh:   0,
            addressLow:    0,
            values:        [],
            mapping:       {}
        };
        options.inputRegs = {
            fullIds:       [],
            changed:       true,
            addressHigh:   0,
            addressLow:    0,
            values:        [],
            mapping:       {}
        };
        options.disInputs = {
            fullIds:       [],
            changed:       true,
            addressHigh:   0,
            addressLow:    0,
            values:        [],
            mapping:       {}
        };
        options.holdingRegs = {
            fullIds:       [],
            changed:       true,
            addressHigh:   0,
            addressLow:    0,
            values:        [],
            mapping:       {}
        };
    } else {
        options.coils = {
             addressLow: 0,
             length: 1000,
             config: [],
             blocks: {}
        };
        options.inputRegs = {
            addressLow: 0,
            length: 1000,
            config: [],
            blocks: {},
        };
        options.disInputs = {
            addressLow: 0,
            length: 1000,
            config: [],
            blocks: {}
        };
        options.holdingRegs = {
            addressLow: 0,
            length: 1000,
            config: [],
            blocks: {},
            cyclicWrite: [] // only holdingRegs
        };
    }
    
    return options;
}

function parseConfig(callback) {
    let options = prepareConfig(adapter.config.params);
    const params                   = adapter.config.params;
    const showAliases              = (params.showAliases     === true || params.showAliases    === 'true');
    const directAddresses          = (params.directAddresses === true || params.directAddresses === 'true');
    const doNotRoundAddressToWord  = (params.doNotRoundAddressToWord === true || params.doNotRoundAddressToWord === 'true');

    adapter.getForeignObjects(adapter.namespace + '.*', (err, list) => {
        let oldObjects = list;
        let newObjects = [];

        adapter.config.disInputs.sort(sortByAddress);
        adapter.config.coils.sort(sortByAddress);
        adapter.config.inputRegs.sort(sortByAddress);
        adapter.config.holdingRegs.sort(sortByAddress);

        let i;
        let address;
        let lastAddress = null;
        let blockStart;
        let startIndex;
        let tasks = [];

        // Discrete inputs
        let regs = adapter.config.disInputs;
        let res  = options.disInputs;
        if (regs && regs.length) {
            for (i = regs.length - 1; i >= 0; i--) {
                address = parseInt(regs[i].address, 10);
                if (address < 0) {
                    adapter.log.error('Invalid discrete inputs address: ' + address);
                    regs.splice(i, 1);
                    continue;
                }
                regs[i].id = 'discreteInputs.';
                if (showAliases) {
                    regs[i].id += address2alias('disInputs', address, directAddresses);
                } else {
                    regs[i].id += address;
                }
                regs[i].id += (regs[i].name ? '_' + (regs[i].name.replace('.', '_').replace(' ', '_')) : '');
            }

            if (regs.length) {
                regs.sort(sortByAddress);
                if (!doNotRoundAddressToWord) {
                    res.addressLow = Math.floor(regs[0].address / 16) * 16;
                }
                res.addressHigh = regs[regs.length - 1].address;
                res.length      = res.addressHigh - res.addressLow + 1;
                if (!doNotRoundAddressToWord && (res.length % 16)) {
                    res.length = (Math.floor(res.length / 16) + 1) * 16;
                }

                // ------------------ create device -------------
                if (res.length) {
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
            } else {
                res.length = 0;
            }
        }

        // Coils
        regs = adapter.config.coils;
        res  = options.coils;
        if (regs && regs.length) {
            res.addressLow  = 0xFFFFFFFF;
            res.addressHigh = 0;
            for (i = regs.length - 1; i >= 0; i--) {
                address = parseInt(regs[i].address, 10);

                if (address < 0) {
                    adapter.log.error('Invalid coils address: ' + address);
                    regs.splice(i, 1);
                    continue;
                }

                regs[i].id = 'coils.';
                if (showAliases) {
                    regs[i].id += address2alias('coils', address, directAddresses);
                } else {
                    regs[i].id += address;
                }
                regs[i].id += (regs[i].name ? '_' + (regs[i].name.replace('.', '_').replace(' ', '_')) : '');

                if (options.config.slave || regs[i].poll) {
                    if (address < res.addressLow)  res.addressLow  = address;
                    if (address > res.addressHigh) res.addressHigh = address;
                }
            }
            if (regs.length) {
                regs.sort(sortByAddress);
                if (!doNotRoundAddressToWord) {
                    res.addressLow = Math.floor(res.addressLow / 16) * 16;
                }

                res.length = res.addressHigh - res.addressLow + 1;
                if (!doNotRoundAddressToWord && (res.length % 16)) {
                    res.length = (Math.floor(res.length / 16) + 1) * 16;
                }

                if (res.length) {
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
            } else {
                regs.length = 0;
            }
            for (i = 0; i <  regs.length; i++) {
                regs.mapping[regs[i].address - res.addressLow] = adapter.namespace + '.' + regs[i].id;
            }
        }

        // Input registers
        regs = adapter.config.inputRegs;
        res  = options.inputRegs;
        if (regs.length) {
            for (i = regs.length - 1; i >= 0; i--) {
                address = parseInt(regs[i].address, 10);
                if (address < 0) {
                    adapter.log.error('Invalid input register address: ' + address);
                    regs.splice(i, 1);
                    continue;
                }

                regs[i].type   = regs[i].type || 'uint16be';
                regs[i].offset = parseFloat(regs[i].offset) || 0;
                regs[i].factor = parseFloat(regs[i].factor) || 1;
                if (regs[i].type === 'string') {
                    regs[i].len = parseInt(regs[i].len) || 1;
                } else {
                    regs[i].len = type_items_len[regs[i].type];
                }
                regs[i].len = regs[i].len || 1;

                if (!regs[i].len) regs[i].len = parseInt(regs[i].len) || 1;

                regs[i].id = 'inputRegisters.';
                if (showAliases) {
                    regs[i].id += address2alias('inputRegs', address, directAddresses);
                } else {
                    regs[i].id += address;
                }

                regs[i].id += (regs[i].name ? '_' + (regs[i].name.replace('.', '_').replace(' ', '_')) : '');
            }

            lastAddress = null;
            startIndex = 0;
            for (i = 0; i < regs.length; i++) {
                address = parseInt(regs[i].address, 10);
                if (address < 0) continue;
                if (lastAddress === null) {
                    blockStart  = address;
                    startIndex = i;
                    lastAddress = address + regs[i].len;
                }

                // try to detect next block
                if ((address - lastAddress > 10 && regs[i].len < 10) || (lastAddress - blockStart >= options.config.maxBlock)) {
                    if (res.blocks.map(obj => obj.start).indexOf(blockStart) === -1) {
                        res.blocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                    }
                    blockStart  = address;
                    startIndex  = i;
                }
                lastAddress = address + regs[i].len;
            }
            if (res.blocks.map(obj => obj.start).indexOf(blockStart) === -1) {
                res.blocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
            }
            if (regs.length) {
                res.addressLow  = regs[0].address;
                res.addressHigh = regs[regs.length - 1].address + regs[regs.length - 1].len;
                res.length      = res.addressHigh - res.addressLow;

                // ------------------ create device -------------
                if (res.length) {
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
            } else {
                regs.length = 0;
            }
        }

        // Holding registers
        regs = adapter.config.holdingRegs;
        res  = options.holdingRegs;
        if (regs.length) {
            res.addressLow  = 0xFFFFFFFF;
            res.addressHigh = 0;

            for (i = regs.length - 1; i >= 0; i--) {
                address = parseInt(regs[i].address, 10);
                if (address < 0) {
                    adapter.log.error('Invalid holding register address: ' + address);
                    regs.splice(i, 1);
                    continue;
                }

                regs[i].type   = regs[i].type || 'uint16be';
                regs[i].offset = parseFloat(regs[i].offset) || 0;
                regs[i].factor = parseFloat(regs[i].factor) || 1;
                if (regs[i].type === 'string') {
                    regs[i].len = parseInt(regs[i].len) || 1;
                } else {
                    regs[i].len = type_items_len[regs[i].type];
                }
                regs[i].len = regs[i].len || 1;

                regs[i].id = 'holdingRegisters.';
                if (showAliases) {
                    regs[i].id += address2alias('holdingRegs', address, directAddresses);
                } else {
                    regs[i].id += address;
                }
                regs[i].id += (regs[i].name ? '_' + (regs[i].name.replace('.', '_').replace(' ', '_')) : '');

                // collect cyclic write registers
                if (regs[i].cw) {
                    res.cyclicWrite.push(adapter.namespace + '.' + regs[i].id);
                }

                if (options.config.slave || regs[i].poll) {
                    if (address < res.addressLow)  res.addressLow  = address;
                    if (address + regs[i].len > res.addressHigh) res.addressHigh = address + regs[i].len;
                }
            }

            lastAddress = null;
            startIndex = 0;
            for (i = 0; i < regs.length; i++) {
                address = parseInt(regs[i].address, 10);
                if (address < 0) continue;
                if (lastAddress === null) {
                    startIndex  = i;
                    blockStart  = address;
                    lastAddress = address + regs[i].len;
                }
                // try to detect next block
                if ((address - lastAddress > 10 && regs[i].len < 10) || (lastAddress - blockStart >= options.config.maxBlock)) {
                    if (res.blocks.map(obj => obj.start).indexOf(blockStart) === -1) {
                        res.blocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                    }
                    blockStart  = address;
                    startIndex  = i;
                }
                lastAddress = address + regs[i].len;
            }
            if (res.blocks.map(obj => obj.start).indexOf(blockStart) === -1) {
                res.blocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
            }

            if (regs.length) {
                res.length = res.addressHigh - res.addressLow;

                // ------------------ create device -------------
                if (res.length) {
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
            } else {
                res.length = 0;
            }

            lastAddress = null;
            for (i = 0; i < regs.length; i++) {
                res.mapping[regs[i].address - res.addressLow] = adapter.namespace + '.' + regs[i].id;
            }
        }

        let id;
        // ------------- create states and objects ----------------------------
        regs = adapter.config.disInputs;
        for (i = 0; regs.length > i; i++) {
            id = adapter.namespace + '.' + regs[i].id;
            regs[i].fullId = id;
            objects[id] = {
                _id: regs[i].id,
                type: 'state',
                common: {
                    name:    regs[i].description,
                    role:    regs[i].role,
                    type:    'boolean',
                    read:    true,
                    write:   false,
                    def:     false
                },
                native: {
                    regType:  'disInputs',
                    address:   regs[i].address
                }
            };
            tasks.push({
                id: regs[i].id,
                name: 'add',
                obj: objects[id]
            });
            tasks.push({
                id: id,
                name: 'syncEnums',
                obj: regs[i].room
            });
            newObjects.push(id);
        }

        regs = adapter.config.coils;
        for (i = 0; regs.length > i; i++) {
            id = adapter.namespace + '.' + regs[i].id;
            regs[i].fullId = id;
            objects[id] = {
                _id: regs[i].id,
                type: 'state',
                common: {
                    name:    regs[i].description,
                    role:    regs[i].role,
                    type:    'boolean',
                    read:    true,
                    write:   true,
                    def:     false
                },
                native: {
                    regType:   'coils',
                    address:   regs[i].address,
                    poll:      regs[i].poll,
                    wp:        regs[i].wp
                }
            };

            tasks.push({
                id: regs[i].id,
                name: 'add',
                obj: objects[id]
            });
            tasks.push({
                id: id,
                name: 'syncEnums',
                obj: regs[i].room
            });
            newObjects.push(id);
        }

        regs = adapter.config.inputRegs;
        for (i = 0; regs.length > i; i++) {
            id = adapter.namespace + '.' + regs[i].id;
            regs[i].fullId = id;
            objects[id] = {
                _id: regs[i].id,
                type: 'state',
                common: {
                    name:    regs[i].description,
                    type:    'number',
                    read:    true,
                    write:   false,
                    def:     0,
                    role:    regs[i].role,
                    unit:    regs[i].unit || ''
                },
                native: {
                    regType:  'inputRegs',
                    address:   regs[i].address,
                    type:      regs[i].type,
                    len:       regs[i].len,
                    offset:    regs[i].offset,
                    factor:    regs[i].factor
                }
            };
            tasks.push({
                id: regs[i].id,
                name: 'add',
                obj: objects[id]
            });
            tasks.push({
                id: id,
                name: 'syncEnums',
                obj: regs[i].room
            });
            newObjects.push(id);
        }

        regs = adapter.config.holdingRegs;
        for (i = 0; regs.length > i; i++) {
            id = adapter.namespace + '.' + regs[i].id;
            regs[i].fullId = id;
            objects[id] = {
                _id: regs[i].id,
                type: 'state',
                common: {
                    name:    regs[i].description,
                    type:    'number',
                    read:    true,
                    write:   true,
                    def:     0,
                    role:    regs[i].role,
                    unit:    regs[i].unit || ''
                },
                native: {
                    regType:   'holdingRegs',
                    address:   regs[i].address,
                    poll:      regs[i].poll,/*,
                         wp:        adapter.config.coils[i].wp*/
                    type:      regs[i].type,
                    len:       regs[i].len,
                    offset:    regs[i].offset,
                    factor:    regs[i].factor
                }
            };
            tasks.push({
                id: regs[i].id,
                name: 'add',
                obj: objects[id]
            });
            tasks.push({
                id: id,
                name: 'syncEnums',
                obj: regs[i].room
            });
            newObjects.push(id);
        }

        // ----------- remember poll values --------------------------
        if (!options.config.slave) {
            options.disInputs.config   = adapter.config.disInputs;
            options.coils.config       = adapter.config.coils.filter(e => e.poll);
            options.inputRegs.config   = adapter.config.inputRegs;
            options.holdingRegs.config = adapter.config.holdingRegs.filter(e => e.poll);

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
            newObjects.push(adapter.namespace + '.info.pollTime');
        } else {
            options.disInputs.fullIds   = adapter.config.disInputs.map(e => e.fullId);
            options.coils.fullIds       = adapter.config.coils.map(e => e.fullId);
            options.inputRegs.fullIds   = adapter.config.inputRegs.map(e => e.fullId);
            options.holdingRegs.fullIds = adapter.config.holdingRegs.map(e => e.fullId);
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

        // create/ update 'info.connection' object
        adapter.getObject('info.connection', function (err, obj) {
            if (!obj) {
                obj = {
                    type: 'state',
                    common: {
                        name:  'Number of connected partners',
                        role:  'indicator.connected',
                        write: false,
                        read:  true,
                        type:  options.config.slave ? 'number' : 'boolean'
                    },
                    native: {}
                };
                adapter.setObjectNotExists('info.connection', obj);
            } else if (options.config.slave && obj.common.type !== 'number') {
                obj.common.type = 'number';
                obj.common.name = 'Number of connected masters';
                adapter.setObjectNotExists('info.connection', obj);
            } else if (!options.config.slave && obj.common.type !== 'boolean') {
                obj.common.type = 'boolean';
                obj.common.name = 'If master connected';
                adapter.setObjectNotExists('info.connection', obj);
            }
        });

        newObjects.push(adapter.namespace + '.info.connection');
        
        // clear unused states
        for (let id_ in oldObjects) {
            if (oldObjects.hasOwnProperty(id_) && newObjects.indexOf(id_) === -1) {
                tasks.push({
                    id: id_,
                    name: 'del'
                });
            }
        }

        processTasks(tasks, function () {
            oldObjects = [];
            newObjects = [];
            adapter.subscribeStates('*');
            callback(options);
        });
    });
}

function main() {
    parseConfig(options => {
        let Modbus;
        if (options.config.slave) {
            Modbus = require(__dirname + '/lib/slave');
        } else {
            Modbus = require(__dirname + '/lib/master');
        }
        modbus = new Modbus(options);
    });
}

function sortByAddress(a, b) {
    let ad = parseFloat(a.address);
    let bd = parseFloat(b.address);
    return ((ad < bd) ? -1 : ((ad > bd) ? 1 : 0));
}
