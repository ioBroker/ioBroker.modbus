import crc16modbus from '../../crc16modbus';
import Put from '../../Put';
import ModbusClientCore from '../modbus-client-core';
import ERROR_CODES from './errors';
import type SerialPort from 'serialport';
let SerialPortClass: any;

function toStrArray(buf: Buffer): string {
    if (!buf?.length) {
        return '';
    }
    let text = '';
    for (let i = 0; i < buf.length; i++) {
        text += (text ? ',' : '') + buf[i];
    }
    return text;
}

export default class ModbusClientSerial extends ModbusClientCore {
    private buffer = Buffer.alloc(0);
    private serialPort: SerialPort.SerialPort | null = null;
    private readonly unitId: number;

    private readonly serial: {
        portName: string;
        baudRate?: number;
        dataBits?: 5 | 6 | 7 | 8;
        stopBits?: 1 | 1.5 | 2;
        parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
    };

    constructor(options: {
        serial: {
            portName: string;
            baudRate?: number;
            dataBits?: 5 | 6 | 7 | 8;
            stopBits?: 1 | 1.5 | 2;
            parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
        };
        unitId?: number;
        logger: ioBroker.Logger;
        timeout?: number;
    }) {
        super(options);
        this.setState('init');
        this.unitId = options.unitId || 1;

        this.serial = options.serial;
        void import('serialport').then(sp => {
            SerialPortClass = sp.SerialPort;
        });

        this.on('send', this.#onSend);

        this.connect();
    }

    #onOpen = (): void => {
        this.emit('connect');
        this.setState('ready');
    };

    #onClose = (): void => {
        this.emit('close');
        this.setState('closed');
    };

    #onData = (data: Buffer): void => {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length > 4) {
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
            if (this.buffer[1] === 5 || this.buffer[1] === 6 || this.buffer[1] === 15 || this.buffer[1] === 16) {
                if (this.buffer.length < 8) {
                    break;
                }
                pdu = this.buffer.slice(0, 8); // 1 byte device ID + 1 byte FC + 2 bytes address + 2 bytes value + 2 bytes CRC
            } else if (this.buffer[1] > 0 && this.buffer[1] < 5) {
                len = this.buffer[2];

                if (this.buffer.length < len + 5) {
                    break;
                }

                pdu = this.buffer.slice(0, len + 5); // 1 byte deviceID + 1 byte FC + 1 byte length  + 2 bytes CRC
            } else {
                const errorCode = this.buffer[2];
                if (this.buffer[1] & 0x80) {
                    // error code
                    if (errorCode && ERROR_CODES[errorCode]) {
                        this.log.error(
                            `Error response for FCx${this.buffer[1] & 0x7f}: ${ERROR_CODES[errorCode].name}`,
                        );
                        this.log.error(`Error response: ${ERROR_CODES[errorCode].desc}`);
                    } else {
                        this.log.error(`Error response: ${errorCode.toString(16)}`);
                    }
                } else {
                    // unknown function code
                    this.log.error(
                        `unknown function code: 0x${this.buffer[1].toString(16)}, 0x${errorCode.toString(16)}`,
                    );
                }
                // reset buffer and try again
                this.buffer = Buffer.alloc(0);
                break;
            }

            if (!crc16modbus(pdu)) {
                /* PDU is valid if CRC across whole PDU equals 0, else ignore and do nothing */
                if (this.unitId !== undefined && pdu[0] !== this.unitId) {
                    // answer for a wrong device
                    this.log.debug(`received answer for wrong ID ${this.buffer[0]}, expected ${this.unitId}`);
                }
                // emit data event and let the
                // listener handle the pdu
                this.emit('data', pdu.slice(1, pdu.length - 2), pdu[0]);
            } else {
                this.log.error(`Wrong CRC for frame: ${toStrArray(pdu)}`);
                // reset buffer and try again
                this.buffer = Buffer.alloc(0);
                break;
            }
            this.buffer = this.buffer.slice(pdu.length, this.buffer.length);
        }
    };

    #onError = (err: string): boolean => this.emit('error', err);

    #onSend = (pdu: Buffer, unitId: number): void => {
        const pkt = new Put().word8((unitId === undefined ? this.unitId : unitId) || 0).put(pdu);
        const buf = pkt.buffer();
        const crc16 = crc16modbus(buf);
        this.connect();

        this.serialPort?.write(pkt.word16le(crc16).buffer(), err => err && this.emit('error', err));
    };

    connect(): void {
        this.setState('connect');

        if (!this.serialPort) {
            const serial = this.serial;

            if (!serial.portName) {
                throw new Error('No portname.');
            }

            serial.baudRate ||= 9600; // the most are working with 9600
            serial.dataBits ||= 8;
            serial.stopBits ||= 1;
            serial.parity ||= 'none';
            // TODO: flowControl - ['xon', 'xoff', 'xany', 'rtscts']

            // TODO: settings - ['brk', 'cts', 'dtr', 'dts', 'rts']

            this.log.debug(`connect to serial ${serial.portName} with ${serial.baudRate}`);

            this.serialPort = new SerialPortClass({
                path: serial.portName,
                baudRate: serial.baudRate,
                parity: serial.parity,
                dataBits: serial.dataBits,
                stopBits: serial.stopBits,
            });

            this.serialPort!.on('open', this.#onOpen);
            this.serialPort!.on('close', this.#onClose);
            this.serialPort!.on('data', this.#onData);
            this.serialPort!.on('error', this.#onError);
        }
    }

    reconnect(): void {}

    close(): void {
        if (this.serialPort) {
            this.serialPort.close();
            this.serialPort = null;
        }
    }
}
