/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const utils       = require('@iobroker/adapter-core');
const adapterName = require('./package.json').name.split('.').pop();
let modbus        = null;
let SerialPort    = null;
let fs;
let adapter;

function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: adapterName, unload: stop});
    adapter = new utils.Adapter(options);

    adapter.on('ready', () => {
        try {
            SerialPort = require('serialport').SerialPort;
        } catch (err) {
            adapter.log.warn('Serial is not available');
        }

        main();
    });

    adapter.on('message', obj => {
        if (obj) {
            switch (obj.command) {
                case 'listUart':
                    if (obj.callback) {
                        if (SerialPort) {
                            // read all found serial ports
                            SerialPort.list().then(ports => {
                                ports = listSerial(ports);
                                adapter.log.info('List of port: ' + JSON.stringify(ports));
                                adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                            }).catch(err => {
                                adapter.log.warn('Can not get Serial port list: ' + err);
                                adapter.sendTo(obj.from, obj.command, [{path: 'Not available'}], obj.callback);
                            });
                        } else {
                            adapter.log.warn('Module serialport is not available');
                            adapter.sendTo(obj.from, obj.command, [{path: 'Not available'}], obj.callback);
                        }
                    }
                    break;
            }
        }
    });

    let infoRegExp = new RegExp(adapter.namespace.replace('.', '\\.') + '\\.info\\.');

    adapter.on('stateChange', (id, state) => {
        if (state && !state.ack && id && !infoRegExp.test(id)) {
            if (!modbus) {
                adapter.log.warn('No connection')
            } else {
                adapter.log.debug('state Changed ack=false: ' + id + ': ' + JSON.stringify(state));
                if (objects[id]) {
                    modbus.write(id, state);
                } else {
                    adapter.getObject(id, (err, data) => {
                        if (!err) {
                            objects[id] = data;
                            modbus.write(id, state);
                        }
                    });
                }
            }
        }
    });

    return adapter;
}

process.on('SIGINT', stop);

function stop(callback) {
    if (modbus) {
        modbus.close();
        modbus = null;
    }

    if (adapter && adapter.setState && adapter.config && adapter.config.params) {
        adapter.setState('info.connection', adapter.config.params.slave ? 0 : false, true);
    }

    if (typeof callback === 'function') {
        return void callback();
    }

    adapter.terminate ? adapter.terminate() : process.exit()
}

let objects    = {};
let enums      = {};

function filterSerialPorts(path) {
    fs = fs || require('fs');
    // get only serial port names
    if (!(/(tty(S|ACM|USB|AMA|MFD|XR)|rfcomm)/).test(path)) {
        return false;
    } else {
        return fs
            .statSync(path)
            .isCharacterDevice();
    }
}

function listSerial(ports) {
    ports = ports || [];
    const path = require('path');
    fs = fs || require('fs');

    // Filter out the devices that aren't serial ports
    let devDirName = '/dev';

    let result;
    try {
        adapter.log.info('Verify ' + JSON.stringify(ports));
        result = fs
            .readdirSync(devDirName)
            .map(file => path.join(devDirName, file))
            .filter(filterSerialPorts)
            .map(port => {
                let found = false;
                for (let v = 0; v < ports.length; v++) {
                    if (ports[v].path === port) {
                        found = true;
                        break;
                    }
                }
                adapter.log.info('Check ' + port + ' : ' + found);

                !found && ports.push({path: port});

                return {path: port};
            });
    } catch (e) {
        if (require('os').platform() !== 'win32') {
            adapter.log.error(`Cannot read "${devDirName}": ${e}`);
        }
        result = ports;
    }
    return result;
}

function addToEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, (err, obj) => {
        if (!err && obj && !obj.common.members.includes(id)) {
            obj.common.members.push(id);
            obj.common.members.sort();
            adapter.setForeignObject(obj._id, obj, err => callback && callback(err));
        } else {
            callback && callback(err);
        }
    });
}

function removeFromEnum(enumName, id, callback) {
    adapter.getForeignObject(enumName, (err, obj) => {
        if (!err && obj) {
            let pos = obj.common.members.indexOf(id);
            if (pos !== -1) {
                obj.common.members.splice(pos, 1);
                adapter.setForeignObject(obj._id, obj, err => callback && callback(err));
            } else {
                callback && callback(err);
            }
        } else {
            callback && callback(err);
        }
    });
}

function syncEnums(enumGroup, id, newEnumName, callback) {
    if (!enums[enumGroup]) {
        adapter.getEnum(enumGroup, (err, _enums) => {
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
            enums[enumGroup][e].common.members.includes(id)) {
            if (enums[enumGroup][e]._id !== newEnumName) {
                count++;
                removeFromEnum(enums[enumGroup][e]._id, id, () =>
                    !--count && typeof callback === 'function' && callback());
            } else {
                found = true;
            }
        }
    }
    if (!found && newEnumName) {
        count++;
        addToEnum(newEnumName, id, () =>
            !--count&& typeof callback === 'function' && callback());
    }

    !count && typeof callback === 'function' && callback();
}

const typeItemsLen = {
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
    'string':     0,
    'stringle':   0,
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
function address2alias(id, address, isDirect, offset) {
    if (typeof address === 'string') {
        address = parseInt(address, 10);
    }

    if (id === 'disInputs' || id === 'coils') {
        address = ((address >> 4) << 4) + (isDirect ? _dmap[address % 16] : _rmap[address % 16]);
        address += offset;
        return address;
    } else {
        return address + offset;
    }
}

function createExtendObject(id, objData, callback) {
    adapter.getObject(id, (err, oldObj) => {
        if (!err && oldObj) {
            adapter.extendObject(id, objData, callback);
        } else {
            adapter.setObjectNotExists(id, objData, callback);
        }
    });
}

function processTasks(tasks, callback) {
    if (!tasks || !tasks.length) {
        return callback();
    }
    let task = tasks.shift();
    try {
        if (task.name === 'add') {
            createExtendObject(task.id, task.obj, (err) => {
                err && adapter.log.info(`Can not execute task ${task.name} for ID ${task.id}: ${err.message}`);
                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.name === 'del') {
            adapter.delObject(task.id, (err) => {
                err && adapter.log.info(`Can not execute task ${task.name} for ID ${task.id}: ${err.message}`);
                setImmediate(processTasks, tasks, callback);
            });
        } else if (task.name === 'syncEnums') {
            syncEnums('rooms', task.id, task.obj, (err) => {
                err && adapter.log.info(`Can not execute task ${task.name} for ID ${task.id}: ${err.message}`);
                setImmediate(processTasks, tasks, callback);
            });
        } else {
            throw new Error('Unknown task');
        }
    } catch (err) {
        adapter.log.info(`Can not execute task ${task.name} for ID ${task.id}: ${err.message}`);
        setImmediate(processTasks, tasks, callback);
    }
}

function prepareConfig(config) {
    let params = config.params;
    params.slave = parseInt(params.slave, 10) || 0; // required in stop

    let options = {
        config: {
            type:                params.type || 'tcp',
            slave:               params.slave,
            alwaysUpdate:        params.alwaysUpdate,
            round:               parseInt(params.round, 10) || 0,
            timeout:             parseInt(params.timeout, 10) || 5000,
            defaultDeviceId:     (params.deviceId === undefined || params.deviceId === null) ? 1 : (parseInt(params.deviceId, 10) || 0),
            doNotIncludeAdrInId: params.doNotIncludeAdrInId,
            preserveDotsInId:    params.preserveDotsInId,
            writeInterval:       parseInt(params.writeInterval, 10) || 0,
            doNotUseWriteMultipleRegisters: params.doNotUseWriteMultipleRegisters === true || params.doNotUseWriteMultipleRegisters === 'true',
            onlyUseWriteMultipleRegisters:  params.onlyUseWriteMultipleRegisters  === true || params.onlyUseWriteMultipleRegisters  === 'true',
        },
        devices: {}
    };

    options.config.round = Math.pow(10, options.config.round);

    if (!options.config.slave) {
        options.config.multiDeviceId = params.multiDeviceId === true || params.multiDeviceId === 'true';
    }

    let deviceIds = [];
    checkDeviceIds(options, config.disInputs,   deviceIds);
    checkDeviceIds(options, config.coils,       deviceIds);
    checkDeviceIds(options, config.inputRegs,   deviceIds);
    checkDeviceIds(options, config.holdingRegs, deviceIds);
    deviceIds.sort();

    // settings for master
    if (!options.config.slave) {
        options.config.poll         = parseInt(params.poll, 10)         || 1000; // default is 1 second
        options.config.recon        = parseInt(params.recon, 10)        || 60000;
        if (options.config.recon < 1000) {
           adapter.log.info('Slave Reconnect time set to 1000ms because was too small (' + options.config.recon + ')');
            options.config.recon = 1000;
        }
        options.config.maxBlock     = parseInt(params.maxBlock, 10)     || 100;
        options.config.maxBoolBlock = parseInt(params.maxBoolBlock, 10) || 128;
        options.config.pulsetime    = parseInt(params.pulsetime         || 1000);
        options.config.waitTime     = (params.waitTime === undefined) ? 50 : (parseInt(params.waitTime, 10) || 0);
        options.config.readInterval = parseInt(params.readInterval, 10) || 0;
    }

    if (params.type === 'tcp' || params.type === 'tcprtu') {
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

    for (let d = 0; d < deviceIds.length; d++) {
        let deviceId = deviceIds[d];
        options.devices[deviceId] = {};
        let device = options.devices[deviceId];
        if (options.config.slave) {
            device.disInputs = {
                fullIds:       [],
                changed:       true,
                addressHigh:   0,
                addressLow:    0,
                values:        [],
                mapping:       {},
                offset:        parseInt(params.disInputsOffset,   10)
            };

            device.coils = {
                fullIds:       [],
                changed:       true,
                addressHigh:   0,
                addressLow:    0,
                values:        [],
                mapping:       {},
                offset:        parseInt(params.coilsOffset,   10)
            };

            device.inputRegs = {
                fullIds:       [],
                changed:       true,
                addressHigh:   0,
                addressLow:    0,
                values:        [],
                mapping:       {},
                offset:        parseInt(params.inputRegsOffset,   10)
            };

            device.holdingRegs = {
                fullIds:       [],
                changed:       true,
                addressHigh:   0,
                addressLow:    0,
                values:        [],
                mapping:       {},
                offset:        parseInt(params.holdingRegsOffset,   10)
            };
        } else {
            device.disInputs = {
                deviceId:    deviceId,
                addressLow:  0,
                length:      0,
                config:      [],
                blocks:      [],
                offset:      parseInt(params.disInputsOffset,   10)
            };

            device.coils = {
                deviceId:    deviceId,
                addressLow:  0,
                length:      0,
                config:      [],
                blocks:      [],
                cyclicWrite: [], // only holdingRegs and coils
                offset:      parseInt(params.coilsOffset,   10)
            };

            device.inputRegs = {
                deviceId:    deviceId,
                addressLow:  0,
                length:      0,
                config:      [],
                blocks:      [],
                offset:      parseInt(params.inputRegsOffset,   10)
            };

            device.holdingRegs = {
                deviceId:    deviceId,
                addressLow:  0,
                length:      0,
                config:      [],
                blocks:      [],
                cyclicWrite: [], // only holdingRegs and coils
                offset:      parseInt(params.holdingRegsOffset,   10)
            };
        }
    }

    options.objects = objects;

    return options;
}

function checkDeviceIds(options, config, deviceIds) {
    for (let i = config.length - 1; i >= 0; i--) {
        config[i].deviceId = !options.config.multiDeviceId ? options.config.defaultDeviceId : (config[i].deviceId !== undefined ? parseInt(config[i].deviceId, 10) : options.config.defaultDeviceId);

        if (isNaN(config[i].deviceId)) {
            config[i].deviceId = options.config.defaultDeviceId;
        }

        if (!deviceIds.includes(config[i].deviceId)) {
            deviceIds.push(config[i].deviceId);
        }
    }
}

function checkObjects(options, regType, regName, regFullName, tasks, newObjects) {
    let regs = options[regType];

    adapter.log.debug(`Initialize Objects for ${regType}: ${JSON.stringify(regs)}`);

    for (let i = 0; regs.length > i; i++) {
        const id = adapter.namespace + '.' + (regs[i].id || i);
        regs[i].fullId = id;
        objects[id] = {
            _id: regs[i].id,
            type: 'state',
            common: {
                name:    regs[i].description,
                role:    regs[i].role,
                type:    regType === 'coils' || regType === 'disInputs' ? 'boolean' :
                    ((regs[i].type === 'string' || regs[i].type === 'stringle') ? 'string' : 'number'),
                read:    true,
                write:   !!options.params.slave || regType === 'coils' || regType === 'holdingRegs',
                def:     regType === 'coils' || regType === 'disInputs' ? false : ((regs[i].type === 'string' || regs[i].type === 'stringle') ? '' : 0)
            },
            native: {
                regType:  regType,
                address:  regs[i].address,
                deviceId: regs[i].deviceId
            }
        };

        if (regType === 'coils') {
            objects[id].native.poll = regs[i].poll;
            objects[id].common.read = !!regs[i].poll;
            objects[id].native.wp   = regs[i].wp;
        } else
        if (regType === 'inputRegs' || regType === 'holdingRegs') {
            objects[id].common.unit   = regs[i].unit || '';

            objects[id].native.type   = regs[i].type;
            objects[id].native.len    = regs[i].len;
            objects[id].native.offset = regs[i].offset;
            objects[id].native.factor = regs[i].factor;
            if (regType === 'holdingRegs') {
                objects[id].native.poll = regs[i].poll;
                objects[id].common.read = !!regs[i].poll;
            }
        }

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
        adapter.log.debug(`Add ${regs[i].id}: ${JSON.stringify(objects[id])}`);
    }

    if (regs.length) {
        tasks.push({
            id: regName,
            name: 'add',
            obj: {
                type: 'channel',
                common: {
                    name: regFullName
                },
                native: {}
            }
        });
    }
}

function assignIds(deviceId, config, result, regName, regType, localOptions) {
    for (let i = config.length - 1; i >= 0; i--) {
        if (config[i].deviceId !== deviceId) {
            continue;
        }
        if (config[i].address === undefined && config[i]._address !== undefined) {
            if (localOptions.showAliases) {
                if (config[i]._address >= result.offset) {
                    config[i].address = config[i]._address - result.offset;

                    if (localOptions.directAddresses && (regType === 'disInputs' || regType === 'coils')) {
                        const address = config[i].address;
                        config[i].address = ((address >> 4) << 4) + (localOptions.directAddresses ? _dmap[address % 16] : _rmap[address % 16]);
                    }
                }
            } else {
                config[i].address = config[i]._address;
            }
        }

        const address = config[i].address = parseInt(config[i].address, 10);

        if (address < 0) {
            continue;
        }

        if (localOptions.multiDeviceId) {
            config[i].id = regName + '.' + deviceId + '.';
        } else {
            config[i].id = regName + '.';
        }

        if (localOptions.showAliases) {
            config[i].id += address2alias(regType, address, localOptions.directAddresses, result.offset);
        } else {
            // add address if not disabled or name not empty
            if (!localOptions.doNotIncludeAdrInId || !config[i].name) {
                config[i].id += address;
                if (localOptions.preserveDotsInId) {
                    config[i].id += '_';
                }
            }
        }

        if (localOptions.preserveDotsInId) {
            // preserve dots in name and add to ID
            config[i].id += (config[i].name ? (config[i].name.replace(/\s/g, '_')) : '');
        } else {
            // replace dots by underlines and add to ID
            config[i].id += (config[i].name ? '_' + (config[i].name.replace(/\./g, '_').replace(/\s/g, '_')) : '');
        }
        if (config[i].id.endsWith('.')) {
            config[i].id += config[i].id.substr(0,config[i].id.length - 1);
        }
    }
}

// localOptions = {
//      multiDeviceId
//      showAliases
//      doNotRoundAddressToWord
//      directAddresses
//      isSlave
//      maxBlock
//      maxBoolBlock
// };
function iterateAddresses(isBools, deviceId, result, regName, regType, localOptions) {
    const config = result.config;

    if (config && config.length) {
        result.addressLow  = 0xFFFFFFFF;
        result.addressHigh = 0;

        for (let i = config.length - 1; i >= 0; i--) {
            if (config[i].deviceId !== deviceId) {
                continue;
            }
            const address = config[i].address = parseInt(config[i].address, 10);

            if (address < 0) {
                adapter.log.error(`Invalid ${regName} address: ${address}`);
                config.splice(i, 1);
                continue;
            }

            if (!isBools) {
                config[i].type   = config[i].type || 'uint16be';
                if (typeof config[i].offset === 'string') {
                    config[i].offset = config[i].offset.replace(',', '.');
                }
                if (typeof config[i].factor === 'string') {
                    config[i].factor = config[i].factor.replace(',', '.');
                }
                config[i].offset = parseFloat(config[i].offset) || 0;
                config[i].factor = parseFloat(config[i].factor) || 1;
                if ((config[i].type === 'string') || (config[i].type === 'stringle')) {
                    config[i].len = parseInt(config[i].len, 10) || 1;
                } else {
                    config[i].len = typeItemsLen[config[i].type];
                }
                config[i].len = config[i].len || 1;
            } else {
                config[i].len = 1;
            }

            // collect cyclic write registers
            if (config[i].cw && result.cyclicWrite && Array.isArray(result.cyclicWrite)) {
                result.cyclicWrite.push(adapter.namespace + '.' + config[i].id);
            }

            if (address < result.addressLow) {
                result.addressLow = address;
            }
            if (address + (config[i].len || 1) > result.addressHigh) {
                result.addressHigh = address + (config[i].len || 1);
            }
        }

        const maxBlock = isBools ? localOptions.maxBoolBlock : localOptions.maxBlock;
        let lastAddress = null;
        let startIndex  = 0;
        let blockStart  = 0;
        let i;
        for (i = 0; i < config.length; i++) {
            if (config[i].deviceId !== deviceId) continue;

            if (lastAddress === null) {
                startIndex  = i;
                blockStart  = config[i].address;
                lastAddress = blockStart + config[i].len;
            }

            // try to detect next block
            if (result.blocks) {
                if ((config[i].address - lastAddress > 10 && config[i].len < 10) || (lastAddress - blockStart >= maxBlock)) {
                    if (!result.blocks.map(obj => obj.start).includes(blockStart)) {
                        result.blocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
                    }
                    blockStart  = config[i].address;
                    startIndex  = i;
                }
            }
            lastAddress = config[i].address + config[i].len;
        }
        if (lastAddress && lastAddress - blockStart && result.blocks && !result.blocks.map(obj => obj.start).includes(blockStart)) {
            result.blocks.push({start: blockStart, count: lastAddress - blockStart, startIndex: startIndex, endIndex: i});
        }

        if (config.length) {
            result.length = result.addressHigh - result.addressLow;
            if (isBools && !localOptions.doNotRoundAddressToWord) {
                result.addressLow = (result.addressLow >> 4) << 4;

                if (result.length % 16) {
                    result.length = ((result.length >> 4) + 1) << 4;
                }
                if (result.blocks) {
                    for (let b = 0; b < result.blocks.length; b++) {
                        result.blocks[b].start = (result.blocks[b].start >> 4) << 4;

                        if (result.blocks[b].count % 16) {
                            result.blocks[b].count = ((result.blocks[b].count >> 4) + 1) << 4;
                        }
                    }
                }
            }
        } else {
            result.length = 0;
        }

        if (result.mapping) {
            for (let i = 0; i < config.length; i++) {
                adapter.log.debug('Iterate ' + regType + ' ' + regName + ': ' + (config[i].address - result.addressLow) + ' = ' + config[i].id);
                result.mapping[config[i].address - result.addressLow] = adapter.namespace + '.' + config[i].id;
            }
        }
    }
}

function parseConfig(callback) {
    let options = prepareConfig(adapter.config);
    const params = adapter.config.params;

    // not for master or slave
    const localOptions = {
        multiDeviceId:           options.config.multiDeviceId,
        showAliases:             params.showAliases             === true || params.showAliases             === 'true',
        doNotRoundAddressToWord: params.doNotRoundAddressToWord === true || params.doNotRoundAddressToWord === 'true',
        directAddresses:         params.directAddresses         === true || params.directAddresses         === 'true',
        maxBlock:                options.config.maxBlock,
        maxBoolBlock:            options.config.maxBoolBlock,
        doNotIncludeAdrInId:     params.doNotIncludeAdrInId     === true || params.doNotIncludeAdrInId     === 'true',
        preserveDotsInId:        params.preserveDotsInId        === true || params.preserveDotsInId        === 'true',
    };

    adapter.getForeignObjects(adapter.namespace + '.*', async (err, list) => {
        let oldObjects = list;
        let newObjects = [];

        adapter.config.disInputs.sort(sortByAddress);
        adapter.config.coils.sort(sortByAddress);
        adapter.config.inputRegs.sort(sortByAddress);
        adapter.config.holdingRegs.sort(sortByAddress);

        let tasks = [];

        for (let _deviceId in options.devices) {
            if (!options.devices.hasOwnProperty(_deviceId)) {
                continue;
            }
            let device = options.devices[_deviceId];
            let deviceId = parseInt(_deviceId, 10);


            // Discrete inputs
            assignIds(deviceId, adapter.config.disInputs, device.disInputs,   'discreteInputs',   'disInputs',   localOptions);
            assignIds(deviceId, adapter.config.coils, device.coils,       'coils',            'coils',       localOptions);
            assignIds(deviceId, adapter.config.inputRegs, device.inputRegs,   'inputRegisters',   'inputRegs',   localOptions);
            assignIds(deviceId, adapter.config.holdingRegs, device.holdingRegs, 'holdingRegisters', 'holdingRegs', localOptions);

            device.disInputs.config   = adapter.config.disInputs.  filter(e =>           e.deviceId === deviceId);
            device.coils.config       = adapter.config.coils.      filter(e => e.poll && e.deviceId === deviceId);
            device.inputRegs.config   = adapter.config.inputRegs.  filter(e =>           e.deviceId === deviceId);
            device.holdingRegs.config = adapter.config.holdingRegs.filter(e => e.poll && e.deviceId === deviceId);

            // ----------- remember poll values --------------------------
            if (!options.config.slave) {
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
            }

            // Discrete inputs
            iterateAddresses(true,  deviceId, device.disInputs,   'discreteInputs',   'disInputs',   localOptions);
            iterateAddresses(true,  deviceId, device.coils,       'coils',            'coils',       localOptions);
            iterateAddresses(false, deviceId, device.inputRegs,   'inputRegisters',   'inputRegs',   localOptions);
            iterateAddresses(false, deviceId, device.holdingRegs, 'holdingRegisters', 'holdingRegs', localOptions);

            // ------------- create states and objects ----------------------------
            checkObjects(adapter.config, 'disInputs',   'discreteInputs',   'Discrete inputs',   tasks, newObjects);
            checkObjects(adapter.config, 'coils',       'coils',            'Coils',             tasks, newObjects);
            checkObjects(adapter.config, 'inputRegs',   'inputRegisters',   'Input registers',   tasks, newObjects);
            checkObjects(adapter.config, 'holdingRegs', 'holdingRegisters', 'Holding registers', tasks, newObjects);

            if (options.config.slave) {
                device.disInputs.fullIds   = adapter.config.disInputs  .filter(e => e.deviceId === deviceId).map(e => e.fullId);
                device.coils.fullIds       = adapter.config.coils      .filter(e => e.deviceId === deviceId).map(e => e.fullId);
                device.inputRegs.fullIds   = adapter.config.inputRegs  .filter(e => e.deviceId === deviceId).map(e => e.fullId);
                device.holdingRegs.fullIds = adapter.config.holdingRegs.filter(e => e.deviceId === deviceId).map(e => e.fullId);
            }

            if (!options.config.multiDeviceId) {
                break;
            }
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
        let obj = await adapter.getObjectAsync('info.connection');
        if (!obj) {
            obj = {
                type: 'state',
                common: {
                    name:  options.config.slave ? 'Number of connected partners' : 'If connected to slave',
                    role:  'indicator.connected',
                    write: false,
                    read:  true,
                    type:  options.config.slave ? 'number' : 'boolean'
                },
                native: {}
            };
            await adapter.setObjectAsync('info.connection', obj);
        } else if (options.config.slave && obj.common.type !== 'string') {
            obj.common.type = 'string';
            obj.common.name = 'Connected masters';
            await adapter.setObjectAsync('info.connection', obj);
        } else if (!options.config.slave && obj.common.type !== 'boolean') {
            obj.common.type = 'boolean';
            obj.common.name = 'If connected to slave';
            await adapter.setObjectAsync('info.connection', obj);
        }
        await adapter.setStateAsync('info.connection', adapter.config.params.slave ? 0 : false, true);

        newObjects.push(adapter.namespace + '.info.connection');

        // clear unused states
        for (let id_ in oldObjects) {
            if (oldObjects.hasOwnProperty(id_) && !newObjects.includes(id_)) {
                adapter.log.debug('Remove old object ' + id_);
                tasks.push({
                    id: id_,
                    name: 'del'
                });
            }
        }

        processTasks(tasks, () => {
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
            Modbus = require('./lib/slave');
        } else {
            Modbus = require('./lib/master');
        }
        modbus = new Modbus(options, adapter);
        modbus.start();
    });
}

function sortByAddress(a, b) {
    let ad = parseFloat(a._address);
    let bd = parseFloat(b._address);
    return ((ad < bd) ? -1 : ((ad > bd) ? 1 : 0));
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
