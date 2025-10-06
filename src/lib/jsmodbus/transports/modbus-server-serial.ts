import ModbusServerCore from '../modbus-server-core';
import crc16modbus from '../../crc16modbus';
import type SerialPort from 'serialport';

let SerialPortClass: any;

export default class ModbusServerSerial extends ModbusServerCore {
    private buffer = Buffer.alloc(0);
    private fifo: { pdu: Buffer; address: number; originalFrame: Buffer }[] = [];
    private serialPort: SerialPort.SerialPort | null = null;
    private readonly deviceId: number = 1;

    private serial: {
        portName: string;
        baudRate?: number;
        dataBits?: 5 | 6 | 7 | 8;
        stopBits?: 1 | 2;
        parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
    };

    constructor(options: {
        serial: {
            portName: string;
            baudRate?: number;
            dataBits?: 5 | 6 | 7 | 8;
            stopBits?: 1 | 2;
            parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
        };
        deviceId?: number;
        logger: ioBroker.Logger;
        timeout?: number;
        responseDelay?: number;
        coils?: Buffer;
        holding?: Buffer;
        input?: Buffer;
        discrete?: Buffer;
    }) {
        super(options);
        this.serial = options.serial;
        this.deviceId = options.deviceId || 1;

        if (!this.serial.portName) {
            throw new Error('No portname specified for serial server.');
        }

        this.serial.baudRate ||= 9600;
        this.serial.dataBits ||= 8;
        this.serial.stopBits ||= 1;
        this.serial.parity ||= 'none';

        this.log.debug(`Starting serial server on port ${this.serial.portName} with settings`);

        try {
            import('serialport')
                .then(sp => {
                    SerialPortClass = sp.SerialPort;

                    this.serialPort = new SerialPortClass({
                        path: this.serial.portName,
                        baudRate: this.serial.baudRate,
                        parity: this.serial.parity,
                        dataBits: this.serial.dataBits,
                        stopBits: this.serial.stopBits,
                    });

                    this.serialPort!.on('open', this.#onSerialOpen);
                    this.serialPort!.on('data', this.#onSerialData);
                    this.serialPort!.on('error', this.#onSerialError);
                    this.serialPort!.on('close', this.#onSerialClose);
                })
                .catch(e => this.log.error(`Error importing serialPort module: ${e}`));
        } catch (err) {
            this.log.error(`Failed to create serial port: ${err.message}`);
            this.emit('error', err);
            return;
        }

        this.on('newState_ready', this.#flush);
    }

    #onSerialOpen = (): void => {
        this.log.debug('Serial port opened successfully');
        this.setState('ready');
        this.emit('connection', { port: this.serial.portName });
    };

    #onSerialClose = (): void => {
        this.log.debug('Serial port closed');
        this.emit('close');
    };

    #onSerialError = (err: string): void => {
        this.log.error(`Serial port error: ${err}`);
        this.emit('error', err);
    };

    #onSerialData = (data: Buffer): void => {
        this.buffer = Buffer.concat([this.buffer, data]);

        // Process complete RTU frames
        while (this.buffer.length >= 4) {
            // Minimum RTU frame: 1 byte address + 1 byte function + 2 bytes CRC
            // Look for a valid RTU frame
            let frameLength = 0;

            // RTU frame structure: [Address][Function Code][Data][CRC16]
            // We need to determine frame length based on function code
            if (this.buffer.length >= 2) {
                const address = this.buffer.readUInt8(0);
                const functionCode = this.buffer.readUInt8(1);

                // Skip frames not for our address (0 = broadcast, our deviceId)
                const deviceId = this.deviceId || 1;
                if (address !== 0 && address !== deviceId) {
                    // Remove first byte and continue looking
                    this.buffer = this.buffer.slice(1);
                    continue;
                }

                frameLength = this.getExpectedFrameLength(functionCode, this.buffer);

                if (frameLength > 0 && this.buffer.length >= frameLength) {
                    // Check CRC
                    const frameData = this.buffer.slice(0, frameLength - 2);
                    const receivedCrc = this.buffer.readUInt16LE(frameLength - 2);
                    const calculatedCrc = crc16modbus(frameData);

                    if (receivedCrc === calculatedCrc) {
                        // Valid frame found
                        const pdu = frameData.slice(1); // Remove address byte to get PDU

                        this.fifo.push({
                            address,
                            pdu,
                            originalFrame: frameData,
                        });

                        this.buffer = this.buffer.slice(frameLength);

                        this.#flush();
                    } else {
                        // Invalid CRC, remove first byte and continue
                        this.log.debug(
                            `Invalid CRC for RTU frame, expected: ${calculatedCrc.toString(16)}received: ${receivedCrc.toString(16)}`,
                        );
                        this.buffer = this.buffer.slice(1);
                    }
                } else if (frameLength === 0) {
                    // Unknown function code, remove first byte
                    this.log.debug(`Unknown function code: ${functionCode}`);
                    this.buffer = this.buffer.slice(1);
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

    getExpectedFrameLength = (functionCode: number, buffer: Buffer): number => {
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

    #flush = (): void => {
        if (this.inState('processing')) {
            return;
        }

        if (!this.fifo.length) {
            return;
        }

        this.setState('processing');

        const current = this.fifo.shift()!;

        this.onData(current.pdu, response => {
            this.log.debug('Sending RTU response');

            // Build RTU response frame: Address + Response PDU + CRC
            const address = current.address;
            const responseFrame = Buffer.concat([Buffer.from([address]), response]);

            // Calculate and append CRC
            const crcValue = crc16modbus(responseFrame);
            const responseWithCrc = Buffer.concat([
                responseFrame,
                Buffer.from([crcValue & 0xff, (crcValue >> 8) & 0xff]), // Little endian CRC
            ]);

            if (this.serialPort?.isOpen) {
                this.serialPort.write(responseWithCrc, err => {
                    if (err) {
                        this.log.error(`Error writing to serial port: ${err}`);
                    } else {
                        this.log.debug(`RTU response sent, length: ${responseWithCrc.length}`);
                    }
                    this.setState('ready');
                });
            } else {
                this.log.error('Serial port not open, cannot send response');
                this.setState('ready');
            }
        });
    };

    close(cb?: (err?: Error | null) => void): void {
        if (this.serialPort?.isOpen) {
            this.serialPort.close(err => {
                if (err) {
                    this.log.error(`Error closing serial port: ${err}`);
                } else {
                    this.log.debug('Serial port closed');
                }
                this.serialPort = null;
                cb?.(err);
            });
        } else {
            cb?.();
        }
    }

    getClients(): string[] {
        // For serial, we return info about the serial port connection
        return this.serialPort?.isOpen ? [this.serial.portName] : [];
    }
}
