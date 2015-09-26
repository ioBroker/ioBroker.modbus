/* jshint -W097 */// jshint strict:false
/* jslint node: true */

"use strict";

var utils        = require(__dirname + '/lib/utils');
var FC           = require('modbus-stack').FUNCTION_CODES;
var adapter      = utils.adapter('modbus');
var async        = require('async');
var snap7        = require('node-snap7');
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

    if (Object.keys(sendBuffer).length == 1) {
        send();
    }
}

function prepareWrite(id, state) {
    if (objects[id].native.rw) {

        if (!objects[id].native.wp) {

            writeHelper(id, state);
            setTimeout(function () {
                adapter.setState(id, ackObjects[id.substring(adapter.namespace.length + 1)].val, true);
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
            adapter.setState(id, ackObjects[id.substring(adapter.namespace.length + 1)].val, true);
        }, 0);
    }
}

function send() {
/*
    var id = Object.keys(sendBuffer)[0];

    var type = objects[id].native.type;
    var val  = sendBuffer[id];
    var data = objects[id];

    if (!modbusclient) {
        return next('modbusclient not exists');
    }
    var buf;

    if (type == "BOOL") {
        if (val === true || val === 1 || val === "true" || val === "1") {
            buf = new Buffer([1]);
        } else {
            buf = new Buffer([0]);
        }

    } else if (type == "BYTE") {
        buf = new Buffer(1);
        buf[0] = parseInt(val, 10) & 0xFF;

    } else if (type == "WORD") {
        val = parseInt(val, 10);
        buf = new Buffer(2);
        buf.writeUInt16BE(parseInt(val, 10), 0, 2);

    } else if (type == "DWORD") {
        buf = new Buffer(4);
        buf.writeUInt32BE(parseInt(val, 10), 0, 4);

    } else if (type == "INT") {
        buf = new Buffer(2);
        buf.writeInt16BE(parseInt(val, 10), 0, 2);

    } else if (type == "DINT") {
        buf = new Buffer(4);
        buf.writeInt32BE(parseInt(val, 10), 0, 4);

    } else if (type == "REAL") {
        buf = new Buffer(4);
        buf.writeFloatBE(parseFloat(val), 0);
    }

    var addr;

    if (data.native.cat == 'db') {

        if (type == "BOOL") {
            addr = data.native.address * 8 + data.native.offsetBit;
            modbusclient.WriteArea(modbusclient.S7AreaDB, data.native.dbId, addr, 1, modbusclient.S7WLBit, buf, function (err) {
                next(err);
            });
        } else if (type == "BYTE") {
            modbusclient.DBWrite(data.native.dbId, data.native.address, 1, buf, function (err) {
                next(err);
            });
        } else if (type == "INT" || type == "WORD") {
            modbusclient.DBWrite(data.native.dbId, data.native.address, 2, buf, function (err) {
                next(err);
            });
        } else if (type == "REAL" || type == "DINT" || type == "DWORD") {
            modbusclient.DBWrite(data.native.dbId, data.native.address, 4, buf, function (err) {
                next(err);
            });
        }
    }

    if (data.native.cat == "input") {
        if (type == "BOOL") {
            addr = data.native.address * 8 + data.native.offsetBit;
            modbusclient.WriteArea(modbusclient.S7AreaPE, 0, addr, 1, modbusclient.S7WLBit, buf, function (err) {
                next(err);
            });
        } else if (type == "BYTE") {
            modbusclient.EBWrite(data.native.address, data.native.address, 1, buf, function (err) {
                next(err);
            });
        } else if (type == "INT" || type == "WORD") {
            modbusclient.EBWrite(data.native.address, data.native.address, 2, buf, function (err) {
                next(err);
            });
        } else if (type == "REAL" || type == "DINT" || type == "DWORD") {
            modbusclient.EBWrite(data.native.address, data.native.address, 4, buf, function (err) {
                next(err);
            });
        }
    }
    if (data.native.cat == "output") {

        if (type == "BOOL") {
            addr = data.native.address * 8 + data.native.offsetBit;
            modbusclient.WriteArea(modbusclient.S7AreaPA, 0, addr, 1, modbusclient.S7WLBit, buf, function (err) {
                next(err);
            });
        } else if (type == "BYTE") {
            modbusclient.ABWrite(data.native.address, data.native.address, 1, buf, function (err) {
                next(err);
            });
        } else if (type == "INT" || type == "WORD") {
            modbusclient.ABWrite(data.native.address, data.native.address, 2, buf, function (err) {
                next(err);
            });
        } else if (type == "REAL" || type == "DINT" || type == "DWORD") {
            modbusclient.ABWrite(data.native.address, data.native.address, 4, buf, function (err) {
                next(err);
            });
        }
    }
    if (data.native.cat == 'marker') {

        if (type == "BOOL") {
            addr = data.native.address * 8 + data.native.offsetBit;
            modbusclient.WriteArea(modbusclient.S7AreaMK, 0, addr, 1, modbusclient.S7WLBit, buf, function (err) {
                next(err);
            });
        } else if (type == "BYTE") {
            modbusclient.MBWrite(data.native.address, 1, buf, function (err) {
                next(err);
            });
        } else if (type == "INT" || type == "WORD") {
            modbusclient.MBWrite(data.native.address, 2, buf, function (err) {
                next(err);
            });
        } else if (type == "REAL" || type == "DINT" || type == "DWORD") {
            modbusclient.MBWrite(data.native.address, 4, buf, function (err) {
                next(err);
            });
        }
    }
*/
    function next(err) {
        if (err) {
            adapter.log.error('DB write error. Code #' + err);
        }
        delete(sendBuffer[id]);
        if (Object.keys(sendBuffer).length) {
            send();
        }
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

            if (main.ac.disInputs.length) {
                for (i = main.ac.disInputs.length - 1; i >= 0; i--) {
                    main.ac.disInputs[i].id = "discreteInputs." + main.ac.disInputs[i].address + (main.ac.disInputs[i].name ? "_" + (main.ac.disInputs[i].name.replace(".", "_").replace(" ", "_")) : '');
                }
                main.disInputsLowAddress  = main.ac.disInputs[i].address;
                main.disInputsHighAddress = main.ac.disInputs[main.ac.disInputs.length - 1].address;
                main.disInputsLength      = main.disInputsHighAddress - main.disInputsLowAddress;
            }

            if (main.ac.coils.length) {
                for (i = main.ac.coils.length - 1; i >= 0; i--) {
                    main.ac.coils[i].id = "coils." + main.ac.coils[i].address + (main.ac.coils[i].name ? "_" + (main.ac.coils[i].name.replace(".", "_").replace(" ", "_")) : '');
                }
                main.coilsLowAddress  = main.ac.coils[i].address;
                main.coilsHighAddress = main.ac.coils[main.ac.coils.length - 1].address;
                main.coilsLength      = main.coilsHighAddress - main.coilsLowAddress;
            }
            
            if (main.ac.inputRegs.length) {
                for (i = main.ac.inputRegs.length - 1; i >= 0; i--) {
                    main.ac.inputRegs[i].id = "inputRegisters." + main.ac.inputRegs[i].address + (main.ac.inputRegs[i].name ? "_" + (main.ac.inputRegs[i].name.replace(".", "_").replace(" ", "_")) : '');
                }
                main.inputRegsLowAddress  = main.ac.inputRegs[i].address;
                main.inputRegsHighAddress = main.ac.inputRegs[main.ac.inputRegs.length - 1].address;
                main.inputRegsLength      = main.inputRegsHighAddress - main.inputRegsLowAddress;
            }

            if (main.ac.holdingRegs.length) {
                for (i = main.ac.holdingRegs.length - 1; i >= 0; i--) {
                    main.ac.holdingRegs[i].id = "holdingRegisters." + main.ac.holdingRegs[i].address + (main.ac.holdingRegs[i].name ? "_" + (main.ac.holdingRegs[i].name.replace(".", "_").replace(" ", "_")) : '');
                }
                main.inputRegsLowAddress  = main.ac.holdingRegs[i].address;
                main.inputRegsHighAddress = main.ac.holdingRegs[main.ac.holdingRegs.length - 1].address;
                main.inputRegsLength      = main.inputRegsHighAddress - main.inputRegsLowAddress;
            }


            // ------------------ create devices -------------
            if (main.ac.disInputs.length > 0) {
                adapter.setObject("discreteInputs", {
                    type: 'channel',
                    common: {
                        name: "Discrete inputs"
                    },
                    native: {}
                });
            }

            if (main.ac.coils.length > 0) {
                adapter.setObject("coils", {
                    type: 'channel',
                    common: {
                        name: "Coils"
                    },
                    native: {}
                });
            }

            if (main.ac.inputRegs.length > 0) {
                adapter.setObject("inputRegisters", {
                    type: 'channel',
                    common: {
                        name: "Input registers"
                    },
                    native: {}
                });
            }

            if (main.ac.holdingRegs.length > 0) {
                adapter.setObject("holdingRegisters", {
                    type: 'channel',
                    common: {
                        name: "Holding registers"
                    },
                    native: {}
                });
            }

            // ------------- create states and objects ----------------------------
            for (i = 0; main.ac.disInputs.length > i; i++) {
                if (main.oldObjects[adapter.namespace + "." + main.ac.disInputs[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + "." + main.ac.disInputs[i].id].common.history || {
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
                        history: main.history
                    },
                    native: {
                        cat:       "disInputs",
                        address:   main.ac.disInputs[i].address,
                        poll:      main.ac.disInputs[i].poll
                    }
                });

                syncEnums('rooms', adapter.namespace + "." + main.ac.disInputs[i].id, main.ac.disInputs[i].room);

                main.newObjects.push(adapter.namespace + "." + main.ac.disInputs[i].id);
            }

            for (i = 0; main.ac.coils.length > i; i++) {
                if (main.oldObjects[adapter.namespace + "." + main.ac.coils[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + "." + main.ac.coils[i].id].common.history || {
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
                        history: main.history
                    },
                    native: {
                        cat:       "coils",
                        address:   main.ac.coils[i].address,
                        poll:      main.ac.coils[i].poll,
                        wp:        main.ac.coils[i].wp
                    }
                });
                syncEnums('rooms', adapter.namespace + "." + main.ac.coils[i].id, main.ac.coils[i].room);
                main.newObjects.push(adapter.namespace + "." + main.ac.coils[i].id);
            }

            for (i = 0; main.ac.inputRegs.length > i; i++) {
                if (main.oldObjects[adapter.namespace + "." + main.ac.inputRegs[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + "." + main.ac.inputRegs[i].id].common.history || {
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
                        role:    main.ac.inputRegs[i].role,
                        unit:    main.ac.inputRegs[i].unit || '',
                        history: main.history
                    },
                    native: {
                        cat:       "inputRegs",
                        address:   main.ac.inputRegs[i].address,
                        poll:      main.ac.inputRegs[i].poll
                    }
                });

                syncEnums('rooms', adapter.namespace + "." + main.ac.inputRegs[i].id, main.ac.inputRegs[i].room);

                main.newObjects.push(adapter.namespace + '.' + main.ac.inputRegs[i].id);
            }

            for (i = 0; main.ac.holdingRegs.length > i; i++) {
                if (main.oldObjects[adapter.namespace + "." + main.ac.holdingRegs[i].id]) {
                    main.history = main.oldObjects[adapter.namespace + "." + main.ac.holdingRegs[i].id].common.history || {
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
                        role:    main.ac.holdingRegs[i].role,
                        unit:    main.ac.holdingRegs[i].unit || '',
                        history: main.history
                    },
                    native: {
                        cat:       "holdingRegs",
                        address:   main.ac.holdingRegs[i].address,
                        poll:      main.ac.holdingRegs[i].poll,
                        wp:        main.ac.coils[i].wp
                    }
                });

                syncEnums('rooms', adapter.namespace + "." + main.ac.inputRegs[i].id, main.ac.inputRegs[i].room);

                main.newObjects.push(adapter.namespace + '.' + main.ac.inputRegs[i].id);
            }

            // ----------- remember poll values --------------------------
            for (i = 0; main.ac.disInputs.length > i; i++) {
                if (main.ac.disInputs[i].poll) {
                    main.disInputs.push(main.ac.disInputs[i]);
                }
            }

            for (i = 0; main.ac.coils.length > i; i++) {
                if (main.ac.coils[i].poll) {
                    main.coils.push(main.ac.coils[i]);
                }
            }

            for (i = 0; main.ac.inputRegs.length > i; i++) {
                if (main.ac.inputRegs[i].poll) {
                    main.inputRegs.push(main.ac.inputRegs[i]);
                }
            }

            for (i = 0; main.ac.holdingRegs.length > i; i++) {
                if (main.ac.holdingRegs[i].poll) {
                    main.holdingRegs.push(main.ac.holdingRegs[i]);
                }
            }

            adapter.setObject("info", {
                type: 'device',
                common: {
                    name:    "info",
                    enabled: false
                },
                native: {}
            });

            adapter.setObject("info.poll_time", {
                type: 'state',
                common: {
                    name: "Poll time",
                    type: 'number',
                    role: '',
                    unit: 'ms'
                },
                native: {}
            });
            main.newObjects.push(adapter.namespace + ".info.poll_time");

            adapter.setObject("info.connection", {
                type: 'state',
                common: {
                    name: 'Connection status',
                    role: 'indicator.connection',
                    type: 'number'
                },
                native: {}
            });
            main.newObjects.push(adapter.namespace + ".info.connection");

            adapter.setState("info.connection", false, true);

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

            handlers[FC.READ_COILS] = function(request, response) {
                var start  = request.startAddress;
                var length = request.quantity;

                /*var resp = new Array(length);
                for (var i=0; i<length; i++) {
                    resp[i] = start + i;
                }*/
                response.writeResponse(resp);
            }

            modbusserver = require('modbus-stack/server').createServer(handlers).listen(main.acp.port);
        } else {
            modbusclient = require('modbus-stack/client').createClient(main.acp.port, main.acp.bind);
            modbusclient.on('connect', function () {
                connected = true;
                adapter.setState("info.connection", true, true);

                main.poll();
            }).on('disconnect', function () {
                connected = false;
                adapter.setState("info.connection", false, true);
            });
        }
    },

    poll: function () {
        var start_t = (new Date()).valueOf();
        async.parallel({
                disInputs: function (callback) {
                    if (main.disInputsLength) {
                        modbusclient.request(FC.READ_DISCRETE_INPUTS, main.disInputsLowAddress, main.disInputsLength)
                            .on('response', function (registers) {
                                for (var n = 0; main.disInputs.length > n; n++) {
                                    var id = main.disInputs[n].id;
                                    var val = registers[main.disInputs[n].address];

                                    if (ackObjects[id] === undefined || ackObjects[id] !== val) {
                                        ackObjects[id] = {val: val};
                                        adapter.setState(id, val ? true : false, true);
                                    }
                                }
                                callback(null);
                            })
                            .on('error', function (err) {
                                callback(err);
                            });
                    } else {
                        callback(null, null);
                    }
                },
                coils: function (callback) {
                    if (main.coilsLength) {
                        modbusclient.request(FC.READ_COILS, main.coilsLowAddress, main.coilsLength)
                            .on('response', function (registers) {
                                for (var n = 0; main.coils.length > n; n++) {
                                    var id = main.coils[n].id;
                                    var val = registers[main.coils[n].address];

                                    if (ackObjects[id] === undefined || ackObjects[id] !== val) {
                                        ackObjects[id] = {val: val};
                                        adapter.setState(id, val ? true : false, true);
                                    }
                                }
                                callback(null);
                            })
                            .on('error', function (err) {
                                callback(err);
                            });
                    } else {
                        callback(null);
                    }
                },
                inputRegs: function (callback) {
                    if (main.inputRegsLength) {
                        modbusclient.request(FC.READ_COILS, main.inputRegsLowAddress, main.inputRegsLength)
                            .on('response', function (registers) {
                                for (var n = 0; main.inputRegs.length > n; n++) {
                                    var id = main.inputRegs[n].id;
                                    var val = registers[main.inputRegs[n].address];

                                    if (ackObjects[id] === undefined || ackObjects[id] !== val) {
                                        ackObjects[id] = {val: val};
                                        adapter.setState(id, val ? true : false, true);
                                    }
                                }
                                callback(null);
                            })
                            .on('error', function (err) {
                                callback(err);
                            });
                    } else {
                        callback(null);
                    }
                },
                holdingRegs: function (callback) {
                    if (main.holdingRegsLength) {
                        modbusclient.request(FC.READ_HOLDING_REGISTERS, main.holdingRegsLowAddress, main.holdingRegsLength)
                            .on('response', function (registers) {
                                for (var n = 0; main.holdingRegs.length > n; n++) {
                                    var id = main.holdingRegs[n].id;
                                    var val = registers[main.holdingRegs[n].address];

                                    if (ackObjects[id] === undefined || ackObjects[id] !== val) {
                                        ackObjects[id] = {val: val};
                                        adapter.setState(id, val ? true : false, true);
                                    }
                                }
                                callback(null);
                            })
                            .on('error', function (err) {
                                callback(err);
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

                    if (main.error_count < 6 && modbusclient.Connected()) {
                        setTimeout(main.poll, main.acp.poll);
                    } else {
                        connected = false;
                        adapter.log.error('try reconnection');
                        adapter.setState("info.connection", false, true);
                        setTimeout(main.start, main.acp.recon);
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

