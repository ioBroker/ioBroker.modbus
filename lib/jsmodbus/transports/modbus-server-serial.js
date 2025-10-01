'use strict';
const stampit = require('stampit');
const ModbusServerCore = require('../modbus-server-core.js');
const StateMachine = require('stampit-state-machine');
const crc = require('crc');

module.exports = stampit()
    .compose(ModbusServerCore)
    .compose(StateMachine)
    .init(function () {
        let serialport;
        let buffer = Buffer.alloc(0);

        let init = () => {
            let serial = this.options.serial;

            if (!serial.portName) {
                throw new Error('No portname specified for serial server.');
            }

            serial.baudRate = serial.baudRate || 9600;
            serial.dataBits = serial.dataBits || 8;
            serial.stopBits = serial.stopBits || 1;
            serial.parity = serial.parity || 'none';

            this.log.debug('Starting serial server on port', serial.portName, 'with settings:', {
                baudRate: serial.baudRate,
                dataBits: serial.dataBits,
                stopBits: serial.stopBits,
                parity: serial.parity,
            });

            try {
                const SerialPort = require('serialport').SerialPort;

                serialport = new SerialPort({
                    path: serial.portName,
                    baudRate: serial.baudRate,
                    parity: serial.parity,
                    dataBits: serial.dataBits,
                    stopBits: serial.stopBits,
                });

                serialport.on('open', onSerialOpen);
                serialport.on('data', onSerialData);
                serialport.on('error', onSerialError);
                serialport.on('close', onSerialClose);
            } catch (err) {
                this.log.error('Failed to create serial port:', err.message);
                this.emit('error', err);
                return;
            }

            this.on('newState_ready', flush);
        };

        let onSerialOpen = () => {
            this.log.debug('Serial port opened successfully');
            this.setState('ready');
            this.emit('connection', { port: this.options.serial.portName });
        };

        let onSerialClose = () => {
            this.log.debug('Serial port closed');
            this.emit('close');
        };

        let onSerialError = err => {
            this.log.error('Serial port error:', err);
            this.emit('error', err);
        };

        let fifo = [];

        let onSerialData = data => {
            buffer = Buffer.concat([buffer, data]);

            // Process complete RTU frames
            while (buffer.length >= 4) {
                // Minimum RTU frame: 1 byte address + 1 byte function + 2 bytes CRC
                // Look for a valid RTU frame
                let frameLength = 0;

                // RTU frame structure: [Address][Function Code][Data][CRC16]
                // We need to determine frame length based on function code
                if (buffer.length >= 2) {
                    const address = buffer.readUInt8(0);
                    const functionCode = buffer.readUInt8(1);

                    // Skip frames not for our address (0 = broadcast, our deviceId)
                    const deviceId = this.options.deviceId || 1;
                    if (address !== 0 && address !== deviceId) {
                        // Remove first byte and continue looking
                        buffer = buffer.slice(1);
                        continue;
                    }

                    frameLength = getExpectedFrameLength(functionCode, buffer);

                    if (frameLength > 0 && buffer.length >= frameLength) {
                        // Check CRC
                        const frameData = buffer.slice(0, frameLength - 2);
                        const receivedCrc = buffer.readUInt16LE(frameLength - 2);
                        const calculatedCrc = crc.crc16modbus(frameData);

                        if (receivedCrc === calculatedCrc) {
                            // Valid frame found
                            const pdu = frameData.slice(1); // Remove address byte to get PDU

                            fifo.push({
                                address: address,
                                pdu: pdu,
                                originalFrame: frameData,
                            });

                            buffer = buffer.slice(frameLength);

                            flush();
                        } else {
                            // Invalid CRC, remove first byte and continue
                            this.log.debug(
                                'Invalid CRC for RTU frame, expected:',
                                calculatedCrc.toString(16),
                                'received:',
                                receivedCrc.toString(16),
                            );
                            buffer = buffer.slice(1);
                        }
                    } else if (frameLength === 0) {
                        // Unknown function code, remove first byte
                        this.log.debug('Unknown function code:', functionCode);
                        buffer = buffer.slice(1);
                    } else {
                        // Not enough data yet, wait for more
                        break;
                    }
                } else {
                    // Not enough data for address and function code
                    break;
                }
            }
        };

        let getExpectedFrameLength = (functionCode, buffer) => {
            // Return expected frame length based on function code
            // Returns 0 if function code is unknown or not enough data

            switch (functionCode) {
                case 0x01: // Read Coils
                case 0x02: // Read Discrete Inputs
                case 0x03: // Read Holding Registers
                case 0x04: // Read Input Registers
                    return buffer.length >= 6 ? 8 : 0; // Address + FC + Start + Count + CRC = 8 bytes

                case 0x05: // Write Single Coil
                case 0x06: // Write Single Register
                    return buffer.length >= 6 ? 8 : 0; // Address + FC + Address + Value + CRC = 8 bytes

                case 0x0f: // Write Multiple Coils
                case 0x10: // Write Multiple Registers
                    if (buffer.length >= 7) {
                        const byteCount = buffer.readUInt8(6);
                        return 9 + byteCount; // Address + FC + Start + Count + ByteCount + Data + CRC
                    }
                    return 0;

                default:
                    return 0; // Unknown function code
            }
        };

        let flush = () => {
            if (this.inState('processing')) {
                return;
            }

            if (!fifo.length) {
                return;
            }

            this.setState('processing');

            let current = fifo.shift();

            this.onData(current.pdu, response => {
                this.log.debug('Sending RTU response');

                // Build RTU response frame: Address + Response PDU + CRC
                const address = current.address;
                const responseFrame = Buffer.concat([Buffer.from([address]), response]);

                // Calculate and append CRC
                const crcValue = crc.crc16modbus(responseFrame);
                const responseWithCrc = Buffer.concat([
                    responseFrame,
                    Buffer.from([crcValue & 0xff, (crcValue >> 8) & 0xff]), // Little endian CRC
                ]);

                if (serialport && serialport.isOpen) {
                    serialport.write(responseWithCrc, err => {
                        if (err) {
                            this.log.error('Error writing to serial port:', err);
                        } else {
                            this.log.debug('RTU response sent, length:', responseWithCrc.length);
                        }
                        this.setState('ready');
                    });
                } else {
                    this.log.error('Serial port not open, cannot send response');
                    this.setState('ready');
                }
            });
        };

        this.close = cb => {
            if (serialport && serialport.isOpen) {
                serialport.close(err => {
                    if (err) {
                        this.log.error('Error closing serial port:', err);
                    } else {
                        this.log.debug('Serial port closed');
                    }
                    serialport = null;
                    cb && cb(err);
                });
            } else {
                cb && cb();
            }
        };

        this.getClients = () => {
            // For serial, we return info about the serial port connection
            return serialport && serialport.isOpen
                ? [{ address: () => ({ address: this.options.serial.portName }) }]
                : [];
        };

        init();
    });
