'use strict';
const stampit = require('stampit');
const Put = require('put');
const crc = require('crc');
const Net = require('node:net');
const ModbusCore = require('../modbus-client-core.js');
const ERROR_CODES = require('./errors');

module.exports = stampit()
    .compose(ModbusCore)
    .init(function () {
        let closedOnPurpose = false;
        let reconnect = false;
        let buffer = new Buffer(0);
        let socket;

        let init = () => {
            this.setState('init');
            let tcp = this.options.tcp;

            tcp.protocolVersion = tcp.protocolVersion || 0;
            tcp.port = tcp.port || 502;
            tcp.host = tcp.host || 'localhost';
            tcp.autoReconnect = tcp.autoReconnect || false;
            tcp.reconnectTimeout = tcp.reconnectTimeout || 0;

            this.on('send', onSend);
            this.on('newState_error', onError);

            //this.on('stateChanged', this.log.debug);
        };

        let connect = () => {
            this.setState('connect');

            if (!socket) {
                socket = new Net.Socket();

                socket.on('connect', onSocketConnect);
                socket.on('close', onSocketClose);
                socket.on('error', onSocketError);
                socket.on('data', onSocketData);
            }

            socket.connect(this.options.tcp.port, this.options.tcp.host);
        };

        let onSocketConnect = () => {
            this.emit('connect');
            this.setState('ready');
        };

        let onSocketClose = hadErrors => {
            this.log.debug('Socket closed with error', hadErrors);

            this.setState('closed');
            this.emit('close');

            if (!closedOnPurpose && (this.options.tcp.autoReconnect || reconnect)) {
                setTimeout(() => {
                    reconnect = false;
                    connect();
                }, this.options.tcp.reconnectTimeout);
            }
        };

        let onSocketError = err => {
            this.log.error('Socket Error', err);
            this.setState('error');
            this.emit('error', err);
        };

        function toStrArray(buf) {
            if (!buf || !buf.length) {
                return '';
            }
            let text = '';
            for (let i = 0; i < buf.length; i++) {
                text += (text ? ',' : '') + buf[i];
            }
            return text;
        }

        let onSocketData = data => {
            buffer = Buffer.concat([buffer, data]);

            while (buffer.length > 4) {
                // 1. there is no mbap
                // 2. extract pdu

                // 0 - device ID
                // 1 - Function CODE
                // 2 - Bytes length
                // 3.. Data
                // checksum.(2 bytes
                let len;
                let pdu;
                // if response for write
                if (buffer[1] === 5 || buffer[1] === 6 || buffer[1] === 15 || buffer[1] === 16) {
                    if (buffer.length < 8) {
                        break;
                    }
                    pdu = buffer.slice(0, 8); // 1 byte device ID + 1 byte FC + 2 bytes address + 2 bytes value + 2 bytes CRC
                } else if (buffer[1] > 0 && buffer[1] < 5) {
                    len = buffer[2];
                    if (buffer.length < len + 5) {
                        break;
                    }
                    pdu = buffer.slice(0, len + 5); // 1 byte deviceID + 1 byte FC + 1 byte length  + 2 bytes CRC
                } else {
                    if (buffer[1] & 0x80) {
                        // error code
                        if (buffer[2] && ERROR_CODES[buffer[2]]) {
                            this.log.error(`Error response for FCx${buffer[1] & 0x7f}: ${ERROR_CODES[buffer[2]].name}`);
                            this.log.error(`Error response: ${ERROR_CODES[buffer[2]].desc}`);
                        } else {
                            this.log.error(`Error response: ${buffer[2].toString(16)}`);
                        }
                    } else {
                        // unknown function code
                        this.log.error(
                            `unknown function code: 0x${buffer[1].toString(16)}, 0x${buffer[2].toString(16)}`,
                        );
                    }
                    // reset buffer and try again
                    buffer = new Buffer(0);
                    break;
                }

                if (crc.crc16modbus(pdu) === 0) {
                    /* PDU is valid if CRC across whole PDU equals 0, else ignore and do nothing */
                    if (this.options.unitId !== undefined && pdu[0] !== this.options.unitId) {
                        // answer for a wrong device
                        this.log.debug(`received answer for wrong ID ${buffer[0]}, expected ${this.options.unitId}`);
                    }
                    // emit data event and let the
                    // listener handle the pdu
                    this.emit('data', pdu.slice(1, pdu.length - 2), pdu[0]);
                } else {
                    this.log.error(`Wrong CRC for frame: ${toStrArray(pdu)}`);
                    // reset buffer and try again
                    buffer = new Buffer(0);
                    break;
                }
                buffer = buffer.slice(pdu.length, buffer.length);
            }
        };

        let onError = () => {
            this.log.error('Client in error state.');
            socket.destroy();
        };

        let onSend = (pdu, unitId) => {
            this.log.debug('Sending pdu to the socket.');
            let pkt = Put()
                .word8((unitId === undefined ? this.options.unitId : unitId) || 0) // unit id
                .put(pdu); // the actual pdu

            let buf = pkt.buffer();
            let crc16 = crc.crc16modbus(buf);
            pkt = pkt.word16le(crc16).buffer();

            socket.write(pkt);
        };

        this.connect = () => {
            this.setState('connect');
            connect();
            return this;
        };

        this.reconnect = () => {
            if (!this.inState('closed')) {
                return this;
            }

            closedOnPurpose = false;
            reconnect = true;
            this.log.debug('Reconnecting client.');
            socket.end();
            return this;
        };

        this.close = () => {
            closedOnPurpose = true;
            this.log.debug('Closing client on purpose.');
            socket.end();
            return this;
        };

        init();
    });
