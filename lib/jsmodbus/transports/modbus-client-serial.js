'use strict';
const stampit = require('stampit');
const crc = require('crc');
const Put = require('put');
const ModbusCore = require('../modbus-client-core.js');
const ERROR_CODES = require('./errors');

module.exports = stampit()
    .compose(ModbusCore)
    .init(function () {
        const SerialPort = require('serialport').SerialPort;
        let serialport;
        let buffer = Buffer.alloc(0);

        let init = () => {
            this.setState('init');
            connect();

            this.on('send', onSend);
        };

        let connect = () => {
            this.setState('connect');

            if (!serialport) {
                let serial = this.options.serial;

                if (!serial.portName) {
                    throw new Error('No portname.');
                }

                serial.baudRate = serial.baudRate || 9600; // the most are working with 9600
                serial.dataBits = serial.dataBits || 8;
                serial.stopBits = serial.stopBits || 1;
                serial.parity = serial.parity || 'none';
                // TODO: flowControl - ['xon', 'xoff', 'xany', 'rtscts']

                // TODO: settings - ['brk', 'cts', 'dtr', 'dts', 'rts']

                this.log.debug(`connect to serial ${serial.portName} with ${serial.baudRate}`);

                serialport = new SerialPort({
                    path: serial.portName,
                    baudRate: serial.baudRate,
                    parity: serial.parity,
                    dataBits: serial.dataBits,
                    stopBits: serial.stopBits,
                });

                serialport.on('open', onOpen);
                serialport.on('close', onClose);
                serialport.on('data', onData);
                serialport.on('error', onError);
            }
        };

        let onOpen = () => {
            this.emit('connect');
            this.setState('ready');
        };

        let onClose = () => {
            this.emit('close');
            this.setState('closed');
        };

        function toStrArray(buf, isHex) {
            if (!buf || !buf.length) {
                return '';
            }
            let text = '';
            for (let i = 0; i < buf.length; i++) {
                text += (text ? ',' : '') + (isHex ? `0x${buf[i].toString(16)}` : buf[i]);
            }
            return text;
        }

        let onData = data => {
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
                        if (ERROR_CODES[buffer[2]]) {
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
                    buffer = Buffer.alloc(0);
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
                    buffer = Buffer.alloc(0);
                    break;
                }
                buffer = buffer.slice(pdu.length, buffer.length);
            }
        };

        let onError = err => this.emit('error', err);

        let onSend = (pdu, unitId) => {
            let pkt = Put()
                .word8((unitId === undefined ? this.options.unitId : unitId) || 0)
                .put(pdu);
            let buf = pkt.buffer();
            let crc16 = crc.crc16modbus(buf);
            pkt = pkt.word16le(crc16).buffer();

            connect();

            serialport.write(pkt, err => err && this.emit('error', err));
        };

        this.connect = () => {
            connect();
        };

        this.close = () => {
            if (serialport) {
                serialport.close();
                serialport = null;
            }
        };

        init();
    });
