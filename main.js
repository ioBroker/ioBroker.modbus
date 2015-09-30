/* jshint -W097 */// jshint strict:false
/* jslint node: true */

"use strict";

var utils        = require(__dirname + '/lib/utils');
var FC           = require('modbus-stack').FUNCTION_CODES;
var adapter      = utils.adapter('modbus');
var async        = require('async');
//var BufferList   = require(__dirname + '/node_modules/modbus-stack/node_modules/bufferlist').BufferList;
var Binary       = require(__dirname + '/node_modules/modbus-stack/node_modules/bufferlist/binary').Binary;
var Put          = require(__dirname + '/node_modules/modbus-stack/node_modules/put');
var modbusclient = null; //Master
var modbusserver = null; //Slave
var connected    = 0;

var nextPoll;
var ackObjects = {};

process.on('SIGINT', function () {
    if (adapter && adapter.setState) {
        adapter.setState("info.connection", false, true);
    }
    if (nextPoll)  {
        clearTimeout(nextPoll);
    }
});

adapter.on('ready', function () {
    adapter.setState("info.connection", false, true);
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
    if (objects[id].native.type == 'coils' || objects[id].native.type == 'holdingRegs') {

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

function send() {
    var id = Object.keys(sendBuffer)[0];

    var type = objects[id].native.type;
    var val  = sendBuffer[id];

    if (type == 'coils') {
        if (val === 'true'  || val === true)  val = 1;
        if (val === 'false' || val === false) val = 0;
        val = parseFloat(val);

        modbusclient.request(FC.WRITE_SINGLE_COIL, objects[id].native.address, val ? true : false, function (err, response) {
            if (err) {
                adapter.log.error(err);
            } else {

            }
        });
    } else if (type == 'holdingRegs') {
        val = parseInt(val, 10);
        modbusclient.request(FC.WRITE_SINGLE_REGISTER, objects[id].native.address, val);
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

var main = {
    oldObjects:             [],
    newObjects:             [],
    round:                  2,

    disInputs:              [],
    disInputsLowAddress:    0,
    disInputsHighAddress:   0,
    disInputsLength:        0,

    coils:                  [],
    coilsLowAddress:        0,
    coilsHighAddress:       0,
    coilsLenght:            0,

    inputRegs:              [],
    inputRegsLowAddress:    0,
    inputRegsHighAddress:   0,
    inputRegsLength:        0,

    holdingRegs:            [],
    holdingRegsLowAddress:  0,
    holdingRegsHighAddress: 0,
    holdingRegsLength:      0,

    history:     "",
    unit:        "",
    error_count: 0,

    main: function () {

        main.ac        = adapter.config;
        main.acp       = adapter.config.params;
        main.acp.poll  = parseInt(main.acp.poll,  10) || 1000; // default is 1 second
        main.acp.recon = parseInt(main.acp.recon, 10) || 60000;
        main.acp.port  = parseInt(main.acp.port, 10)  || 502;
        main.acp.disInputsOffset    = parseInt(main.acp.disInputsOffset, 10)    || 0;
        main.acp.coilsOffset        = parseInt(main.acp.coilsOffset, 10)        || 0;
        main.acp.inputRegsOffset    = parseInt(main.acp.inputRegsOffset, 10)    || 0;
        main.acp.holdingRegsOffset  = parseInt(main.acp.holdingRegsOffset, 10)  || 0;

        if (main.acp.round) {
            main.round = parseInt(main.acp.round) || 2;
        } else {
            main.round = 2;
        }

        main.round = Math.pow(10, main.round);

        adapter.config.params.pulsetime = parseInt(adapter.config.params.pulsetime || 1000);

        adapter.getForeignObjects(adapter.namespace + ".*", function (err, list) {

            main.oldObjects = list;

            main.ac.disInputs.sort(SortByAddress);
            main.ac.coils.sort(SortByAddress);
            main.ac.inputRegs.sort(SortByAddress);
            main.ac.holdingRegs.sort(SortByAddress);

            var i;
            var address;
            var _map = {
                0: 7,
                1: 6,
                2: 5,
                3: 4,
                4: 3,
                5: 2,
                6: 1,
                7: 0,
                8: 15,
                9: 14,
                10: 13,
                11: 12,
                12: 11,
                13: 10,
                14: 9,
                15: 8
            }

            if (main.ac.disInputs.length) {
                for (i = main.ac.disInputs.length - 1; i >= 0; i--) {
                    address = main.ac.disInputs[i].address;
                    main.ac.disInputs[i].address = address - main.acp.disInputsOffset;
                    if (main.ac.disInputs[i].address < 0) {
                        adapter.log.error('Invalid discrete inputs address: ' + (main.ac.disInputs[i].address + main.acp.disInputsOffset) + ', but offset is ' + main.acp.disInputsOffset);
                        main.ac.disInputs.splice(i, 1);
                        continue;
                    }
                    // calculate reference to address
                    main.ac.disInputs[i].address = Math.floor(main.ac.disInputs[i].address / 16) * 16 + _map[main.ac.disInputs[i].address % 16];

                    main.ac.disInputs[i].id = 'discreteInputs.' + address + (main.ac.disInputs[i].name ? '_' + (main.ac.disInputs[i].name.replace('.', '_').replace(' ', '_')) : '');
                }
                if (main.ac.disInputs.length) {
                    main.ac.disInputs.sort(SortByAddress);
                    main.disInputsLowAddress  = Math.floor(main.ac.disInputs[0].address / 16) * 16;
                    main.disInputsHighAddress = main.ac.disInputs[main.ac.disInputs.length - 1].address;
                    main.disInputsLength      = main.disInputsHighAddress - main.disInputsLowAddress + 1;
                    if (main.disInputsLength % 16) main.disInputsLength = (Math.floor(main.disInputsLength / 16) + 1) * 16
                } else {
                    main.disInputsLength = 0;
                }
            }

            if (main.ac.coils.length) {
                main.coilsLowAddress  = 0xFFFFFFFF;
                main.coilsHighAddress = 0;
                for (i = main.ac.coils.length - 1; i >= 0; i--) {
                    address = main.ac.coils[i].address;

                    main.ac.coils[i].address = main.ac.coils[i].address - main.acp.coilsOffset;
                    if (main.ac.coils[i].address < 0) {
                        adapter.log.error('Invalid coils address: ' + address + ', but offset is ' + main.acp.coilsOffset);
                        main.ac.coils.splice(i, 1);
                        continue;
                    }
                    // calculate reference to address
                    main.ac.coils[i].address = Math.floor(main.ac.coils[i].address / 16) * 16 + _map[main.ac.coils[i].address % 16];

                    main.ac.coils[i].id = 'coils.' + address + (main.ac.coils[i].name ? '_' + (main.ac.coils[i].name.replace('.', '_').replace(' ', '_')) : '');
                    if (main.acp.slave || main.ac.coils[i].poll) {
                        if (main.ac.coils[i].address < main.coilsLowAddress)  main.coilsLowAddress  = main.ac.coils[i].address;
                        if (main.ac.coils[i].address > main.coilsHighAddress) main.coilsHighAddress = main.ac.coils[i].address;
                    }
                }
                if (main.ac.coils.length) {
                    main.ac.coils.sort(SortByAddress);
                    main.coilsLowAddress = Math.floor(main.coilsLowAddress / 16) * 16;
                    main.coilsLength = main.coilsHighAddress - main.coilsLowAddress + 1;
                    if (main.coilsLength % 16) main.coilsLength = (Math.floor(main.coilsLength / 16) + 1) * 16
                } else {
                    main.coilsLength = 0;
                }
            }
            
            if (main.ac.inputRegs.length) {
                for (i = main.ac.inputRegs.length - 1; i >= 0; i--) {
                    address = main.ac.inputRegs[i].address;
                    main.ac.inputRegs[i].address = address - main.acp.inputRegsOffset;
                    if (main.ac.inputRegs[i].address < 0) {
                        adapter.log.error('Invalid input register address: ' + address + ', but offset is ' + main.acp.inputRegsOffset);
                        main.ac.inputRegs.splice(i, 1);
                        continue;
                    }
                    main.ac.inputRegs[i].id = 'inputRegisters.' + address + (main.ac.inputRegs[i].name ? '_' + (main.ac.inputRegs[i].name.replace('.', '_').replace(' ', '_')) : '');
                }
                if (main.ac.inputRegs.length) {
                    main.inputRegsLowAddress = main.ac.inputRegs[0].address;
                    main.inputRegsHighAddress = main.ac.inputRegs[main.ac.inputRegs.length - 1].address;
                    main.inputRegsLength = main.inputRegsHighAddress - main.inputRegsLowAddress + 1;
                } else {
                    main.ac.inputRegs.length = 0;
                }
            }

            if (main.ac.holdingRegs.length) {
                main.holdingRegsLowAddress  = 0xFFFFFFFF;
                main.holdingRegsHighAddress = 0;
                for (i = main.ac.holdingRegs.length - 1; i >= 0; i--) {
                    address = main.ac.holdingRegs[i].address;
                    main.ac.holdingRegs[i].address = address - main.acp.holdingRegsOffset;
                    if (main.ac.holdingRegs[i].address < 0) {
                        adapter.log.error('Invalid holding register address: ' + address + ', but offset is ' + main.acp.holdingRegsOffset);
                        main.ac.holdingRegs.splice(i, 1);
                        continue;
                    }
                    main.ac.holdingRegs[i].id = 'holdingRegisters.' + address + (main.ac.holdingRegs[i].name ? '_' + (main.ac.holdingRegs[i].name.replace('.', '_').replace(' ', '_')) : '');
                    if (main.acp.slave || main.ac.holdingRegs[i].poll) {
                        if (main.ac.holdingRegs[i].address < main.holdingRegsLowAddress)  main.holdingRegsLowAddress  = main.ac.holdingRegs[i].address;
                        if (main.ac.holdingRegs[i].address > main.holdingRegsHighAddress) main.holdingRegsHighAddress = main.ac.holdingRegs[i].address;
                    }
                }
                if (main.ac.holdingRegs.length) {
                    main.holdingRegsLength = main.holdingRegsHighAddress - main.holdingRegsLowAddress + 1;
                } else {
                    main.holdingRegsLength = 0;
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

            // ------------- create states and objects ----------------------------
            for (i = 0; main.ac.disInputs.length > i; i++) {
                if (main.oldObjects[adapter.namespace + '.' + main.ac.disInputs[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + '.' + main.ac.disInputs[i].id].common.history || {
                            enabled:     false,
                            changesOnly: true,
                            minLength:   480,
                            maxLength:   960,
                            retention:   604800,
                            debounce:    10000
                        };
                } else {
                    main.history = {
                        enabled:      false,
                        changesOnly:  true,
                        minLength:    480,
                        maxLength:    960,
                        retention:    604800,
                        debounc:      10000
                    };
                }

                adapter.setObject(main.ac.disInputs[i].id, {
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
                        type:     'disInputs',
                        address:   main.ac.disInputs[i].address
                    }
                });

                syncEnums('rooms', adapter.namespace + '.' + main.ac.disInputs[i].id, main.ac.disInputs[i].room);

                main.newObjects.push(adapter.namespace + '.' + main.ac.disInputs[i].id);
            }

            for (i = 0; main.ac.coils.length > i; i++) {
                if (main.oldObjects[adapter.namespace + '.' + main.ac.coils[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + '.' + main.ac.coils[i].id].common.history || {
                            "enabled":     false,
                            "changesOnly": true,
                            "minLength":   480,
                            "maxLength":   960,
                            "retention":   604800,
                            "debounce":    10000
                        };
                } else {
                    main.history = {
                        "enabled":     false,
                        "changesOnly": true,
                        "minLength":   480,
                        "maxLength":   960,
                        "retention":   604800,
                        "debounce":    10000
                    };
                }
                adapter.setObject(main.ac.coils[i].id, {
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
                        type:      'coils',
                        address:   main.ac.coils[i].address,
                        poll:      main.ac.coils[i].poll,
                        wp:        main.ac.coils[i].wp
                    }
                });
                syncEnums('rooms', adapter.namespace + '.' + main.ac.coils[i].id, main.ac.coils[i].room);
                main.newObjects.push(adapter.namespace + '.' + main.ac.coils[i].id);
            }

            for (i = 0; main.ac.inputRegs.length > i; i++) {
                if (main.oldObjects[adapter.namespace + '.' + main.ac.inputRegs[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + '.' + main.ac.inputRegs[i].id].common.history || {
                            enabled:     false,
                            changesOnly: true,
                            minLength:   480,
                            maxLength:   960,
                            retention:   604800,
                            debounce:    10000
                        };
                } else {
                    main.history = {
                        enabled:     false,
                        changesOnly: true,
                        minLength:   480,
                        maxLength:   960,
                        retention:   604800,
                        debounce:    10000
                    };
                }
                adapter.setObject(main.ac.inputRegs[i].id, {
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
                        type:     'inputRegs',
                        address:   main.ac.inputRegs[i].address
                    }
                });

                syncEnums('rooms', adapter.namespace + '.' + main.ac.inputRegs[i].id, main.ac.inputRegs[i].room);

                main.newObjects.push(adapter.namespace + '.' + main.ac.inputRegs[i].id);
            }

            for (i = 0; main.ac.holdingRegs.length > i; i++) {
                if (main.oldObjects[adapter.namespace + '.' + main.ac.holdingRegs[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + '.' + main.ac.holdingRegs[i].id].common.history || {
                        enabled:     false,
                        changesOnly: true,
                        minLength:   480,
                        maxLength:   960,
                        retention:   604800,
                        debounce:    10000
                    };
                } else {
                    main.history = {
                        enabled:     false,
                        changesOnly: true,
                        minLength:   480,
                        maxLength:   960,
                        retention:   604800,
                        debounce:    10000
                    };
                }
                adapter.setObject(main.ac.holdingRegs[i].id, {
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
                        type:     'holdingRegs',
                        address:   main.ac.holdingRegs[i].address,
                        poll:      main.ac.holdingRegs[i].poll/*,
                        wp:        main.ac.coils[i].wp*/
                    }
                });

                syncEnums('rooms', adapter.namespace + '.' + main.ac.holdingRegs[i].id, main.ac.holdingRegs[i].room);

                main.newObjects.push(adapter.namespace + '.' + main.ac.holdingRegs[i].id);
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
                adapter.getStates(function (err, states) {
                    var id;
                    // build ready arrays
                    for (i = 0; main.ac.disInputs.length > i; i++) {
                        id = main.ac.disInputs[i].id;
                        if (states[id].val === 'true')  states[id].val = 1;
                        if (states[id].val === '1')     states[id].val = 1;
                        if (states[id].val === '0')     states[id].val = 0;
                        if (states[id].val === 'false') states[id].val = false;
                        states[id].val = !!states[id].val;
                        main.disInputs[main.ac.disInputs[i].address - main.disInputsLowAddress] = states[id].val;
                    }

                    for (i = 0; main.ac.coils.length > i; i++) {
                        id = main.ac.coils[i].id;
                        if (states[id].val === 'true')  states[id].val = 1;
                        if (states[id].val === '1')     states[id].val = 1;
                        if (states[id].val === '0')     states[id].val = 0;
                        if (states[id].val === 'false') states[id].val = false;
                        states[id].val = !!states[id].val;
                        main.coils[main.ac.coils[i].address - main.coilsLowAddress] = states[id].val;
                    }

                    for (i = 0; main.ac.inputRegs.length > i; i++) {
                        id = main.ac.inputRegs[i].id;
                        if (states[id].val === 'true')  states[id].val = 1;
                        if (states[id].val === 'false') states[id].val = false;
                        states[id].val = parseInt(states[id].val, 10);
                        main.inputRegs[main.ac.inputRegs[i].address - main.inputRegsLowAddress] = states[id].val;
                    }

                    for (i = 0; main.ac.holdingRegs.length > i; i++) {
                        id = main.ac.holdingRegs[i].id;
                        if (states[id].val === 'true')  states[id].val = 1;
                        if (states[id].val === 'false') states[id].val = false;
                        states[id].val = parseInt(states[id].val, 10);
                        main.holdingRegs[main.ac.holdingRegs[i].address - main.holdingRegsLowAddress] = states[id].val;
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

            adapter.setObject("info.poll_time", {
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
            main.newObjects.push(adapter.namespace + ".info.poll_time");

            adapter.setObject("info.connection", {
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
            main.newObjects.push(adapter.namespace + ".info.connection");

            adapter.setState("info.connection", 0, true);

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

    start: function () {

        if (main.acp.slave) {
            var handlers = {};

            handlers[FC.READ_DISCRETE_INPUTS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length);
                var i = 0;
                while (i < length && i + start < main.disInputsLowAddress) {
                    resp[i] = 0;
                    i++;
                }
                while (i < length && i + start <= main.disInputsHighAddress) {
                    resp[i] = main.disInputs[i + start - main.disInputsLowAddress];
                    i++;
                }
                if (i > main.disInputsHighAddress) {
                    while (i < length) {
                        resp[i] = 0;
                        i++;
                    }
                }

                response.writeResponse(resp);
            };
            handlers[FC.READ_COILS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length);
                var i = 0;
                while (i < length && i + start < main.coilsLowAddress) {
                    resp[i] = 0;
                    i++;
                }
                while (i < length && i + start <= main.coilsHighAddress) {
                    resp[i] = main.coils[i + start - main.coilsLowAddress];
                    i++;
                }
                if (i > main.coilsHighAddress) {
                    while (i < length) {
                        resp[i] = 0;
                        i++;
                    }
                }

                response.writeResponse(resp);
            };
            handlers[FC.READ_HOLDING_REGISTERS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length);
                var i = 0;
                while (i < length && i + start < main.holdingRegsLowAddress) {
                    resp[i] = 0;
                    i++;
                }
                while (i < length && i + start <= main.holdingRegsHighAddress) {
                    resp[i] = main.holdingRegs[i + start - main.holdingRegsLowAddress];
                    i++;
                }
                if (i > main.holdingRegsHighAddress) {
                    while (i < length) {
                        resp[i] = 0;
                        i++;
                    }
                }

                response.writeResponse(resp);
            };
            handlers[FC.READ_INPUT_REGISTERS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length);
                var i = 0;
                while (i < length && i + start < main.inputRegsLowAddress) {
                    resp[i] = 0;
                    i++;
                }
                while (i < length && i + start <= main.inputRegsHighAddress) {
                    resp[i] = main.inputRegs[i + start - main.inputRegsLowAddress];
                    i++;
                }
                if (i > main.inputRegsHighAddress) {
                    while (i < length) {
                        resp[i] = 0;
                        i++;
                    }
                }

                response.writeResponse(resp);
            };
            handlers[FC.WRITE_SINGLE_COIL] = function(request, response) {
                var start  = request.startAddress;
                var length = 1;

                var i = 0;
                while (i < length && i + start <= main.coilsHighAddress) {
                    main.coils[i + start - main.coilsLowAddress] = request[0];
                    //adapter.setState();
                    i++;
                }

                response.writeResponse(resp);
            };
            handlers[FC.WRITE_SINGLE_REGISTER] = function(request, response) {
                var start  = request.startAddress;
                var length = 1;

                var i = 0;
                while (i < length && i + start <= main.holdingRegsLowAddress) {
                    main.holdingRegs[i + start - main.holdingRegsLowAddress] = request[0];
                    i++;
                }

                response.writeResponse(resp);
            };
            handlers[FC.WRITE_MULTIPLE_COILS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length);
                var i = 0;
                while (i < length && i + start <= main.coilsLowAddress) {
                    main.coils[i + start - main.coilsLowAddress] = request[0];
                    i++;
                }

                response.writeResponse(resp);
            };
            handlers[FC.WRITE_MULTIPLE_REGISTERS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                var resp = new Array(length);
                var i = 0;
                while (i < length && i + start <= main.holdingRegsLowAddress) {
                    main.holdingRegs[i + start - main.holdingRegsLowAddress] = request[0];
                    i++;
                }

                response.writeResponse(resp);
            };

            modbusserver = require('modbus-stack/server').createServer(handlers).listen(main.acp.port);
        } else {
            var Client = require('modbus-stack/client');
            Client.RESPONSES[FC.READ_DISCRETE_INPUTS] = function(bufferlist) {
                var rtn = [];
                var binary = Binary(bufferlist).getWord8('byteLength').end();
                rtn.byteLength = binary.vars.byteLength;
                var i;
                var l;
                var val;
                for (i = 0, l = Math.floor(binary.vars.byteLength / 2); i < l; i++) {
                    binary.getWord16be("val");
                    val = binary.end().vars.val;
                    for (var b = 15; b >= 0; b--) {
                        rtn.unshift(((val >> b) & 1) ? true : false);
                    }
                }
                // read last byte
                if (i * 2 < binary.vars.byteLength) {
                    binary.getWord8("val");
                    val = binary.end().vars.val;
                    for (var b = 7; b >= 0; b--) {
                        rtn.unshift(((val >> b) & 1) ? true : false);
                    }
                }
                return rtn;
            };
            Client.RESPONSES[FC.READ_COILS] = Client.RESPONSES[FC.READ_DISCRETE_INPUTS];
            Client.RESPONSES[FC.READ_INPUT_REGISTERS] = function(bufferlist) {
                var rtn = [];
                var binary = Binary(bufferlist).getWord8('byteLength').end();
                rtn.byteLength = binary.vars.byteLength;
                for (var i = 0, l = binary.vars.byteLength / 2; i < l; i++) {
                    binary.getWord16be("val");
                    rtn.push(binary.end().vars.val);
                }
                return rtn;
            };
            Client.RESPONSES[FC.READ_HOLDING_REGISTERS] = Client.RESPONSES[FC.READ_INPUT_REGISTERS];
            Client.RESPONSES[FC.WRITE_SINGLE_REGISTER] = Client.RESPONSES[FC.READ_INPUT_REGISTERS];
            Client.RESPONSES[FC.WRITE_SINGLE_COIL] = Client.RESPONSES[FC.READ_DISCRETE_INPUTS];
            Client.REQUESTS[FC.WRITE_SINGLE_REGISTER] = function(address, value) {
                if (typeof value !== 'number') throw new Error('"Write Single Coil" expects a \'boolean\' value');
                return Put()
                    .word16be(address)
                    .word16be(value)
                    .buffer();
            };

            modbusclient = Client.createClient(main.acp.port, main.acp.bind);


            modbusclient.on('connect', function () {
                if (!connected) {
                    connected = 1;
                    adapter.setState('info.connection', connected, true);
                }
                adapter.setState("info.connection", true, true);

                main.poll();
            }).on('disconnect', function () {
                if (connected) {
                    connected = 0;
                    adapter.setState('info.connection', connected, true);
                }
                setTimeout(function () {
                    main.start();
                }, main.acp.recon);
            });

            modbusclient.on('error', function (err) {
                adapter.log.warn(err);
                if (connected) {
                    connected = 0;
                    adapter.setState('info.connection', connected, true);
                }
                setTimeout(function () {
                    main.start();
                }, main.acp.recon);
            });
        }
    },
    poll: function () {
        var start_t = (new Date()).valueOf();
        async.parallel({
                disInputs: function (callback) {
                    if (0 && main.disInputsLength) {
                        modbusclient.request(FC.READ_DISCRETE_INPUTS, main.disInputsLowAddress, main.disInputsLength, function (err, registers) {
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
                        callback(null, null);
                    }
                },
                coils: function (callback) {
                    if (0 && main.coilsLength) {
                        modbusclient.request(FC.READ_COILS, main.coilsLowAddress, main.coilsLength, function (err, registers) {
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
                inputRegs: function (callback) {
                    if (0 && main.inputRegsLength) {
                        modbusclient.request(FC.READ_INPUT_REGISTERS, main.inputRegsLowAddress, main.inputRegsLength, function (err, registers) {
                            if (err) {
                                callback(err);
                            } else {
                                for (var n = 0; main.inputRegs.length > n; n++) {
                                    var id = main.inputRegs[n].id;
                                    var val = registers[main.inputRegs[n].address - main.inputRegsLowAddress];

                                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                                        ackObjects[id] = {val: val};
                                        adapter.setState(id, val, true);
                                    }
                                }
                                callback(null);
                            }
                        });
                    } else {
                        callback(null);
                    }
                },
                holdingRegs: function (callback) {
                    if (main.holdingRegsLength) {
                        modbusclient.request(FC.READ_HOLDING_REGISTERS, main.holdingRegsLowAddress, main.holdingRegsLength, function (err, registers) {
                            if (err) {
                                callback(err);
                            } else {
                                for (var n = 0; main.holdingRegs.length > n; n++) {
                                    var id = main.holdingRegs[n].id;
                                    var val = registers[main.holdingRegs[n].address - main.holdingRegsLowAddress];

                                    if (ackObjects[id] === undefined || ackObjects[id].val !== val) {
                                        ackObjects[id] = {val: val};
                                        adapter.setState(id, val, true);
                                    }
                                }
                                callback(null);
                            }
                        });
                    } else {
                        callback(null);
                    }
                }
            },

            function (err) {
                if (err) {
                    main.error_count++;

                    adapter.log.warn('Poll error count : ' + main.error_count + " code: " + err);
                    adapter.setState("info.connection", false, true);

                    if (main.error_count < 6 && connected) {
                        setTimeout(main.poll, main.acp.poll);
                    } else {
                        if (connected) {
                            connected = 0;
                            adapter.setState('info.connection', connected, true);
                        }
                        adapter.log.error('try reconnection');
                        setTimeout(function () {
                            main.start()
                        }, main.acp.recon);
                    }
                } else {

                    adapter.setState("info.poll_time", (new Date()).valueOf() - start_t, true);
                    if (main.error_count > 0) {
                        adapter.setState("info.connection", true, true);
                        main.error_count = 0;
                    }
                    nextPoll = setTimeout(main.poll, main.acp.poll);
                }
            }
        );
    }
};

function SortByAddress(a, b) {
    var ad = parseFloat(a.address);
    var bd = parseFloat(b.address);
    return ((ad < bd) ? -1 : ((ad > bd) ? 1 : 0));
}

