import Put from '../../Put';
import crc16modbus from '../../crc16modbus';
import { Socket } from 'node:net';
import ModbusClientCore from '../modbus-client-core';
import ERROR_CODES from './errors';

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

export default class ModbusClientTcpRtu extends ModbusClientCore {
    private closedOnPurpose = false;
    #reconnect = false;
    private buffer = Buffer.alloc(0);
    private socket: Socket | null = null;
    private tcp: {
        host: string;
        port: number;
        protocolVersion: number;
        autoReconnect: boolean;
        reconnectTimeout: number;
    };
    private readonly unitId: number;

    constructor(options: {
        tcp: {
            host?: string;
            port?: number;
            protocolVersion?: number;
            autoReconnect?: boolean;
            reconnectTimeout?: number;
        };
        unitId?: number;
        logger: ioBroker.Logger;
        timeout?: number;
    }) {
        super(options);

        this.setState('init');
        this.tcp = options.tcp as {
            host: string;
            port: number;
            protocolVersion: number;
            autoReconnect: boolean;
            reconnectTimeout: number;
        };
        this.unitId = options.unitId || 1;

        this.tcp.protocolVersion ||= 0;
        this.tcp.port ||= 502;
        this.tcp.host ||= 'localhost';
        this.tcp.autoReconnect ||= false;
        this.tcp.reconnectTimeout ||= 0;

        this.on('send', this.#onSend);
        this.on('newState_error', this.#onError);
    }

    #onSocketConnect = (): void => {
        this.emit('connect');
        this.setState('ready');
    };

    #onSocketClose = (hadErrors: boolean): void => {
        this.log.debug(hadErrors ? 'Socket closed with error' : 'Socket closed');

        this.setState('closed');
        this.emit('close');

        if (!this.closedOnPurpose && (this.tcp.autoReconnect || this.#reconnect)) {
            setTimeout(() => {
                this.#reconnect = false;
                this.connect();
            }, this.tcp.reconnectTimeout);
        }
    };

    #onSocketError = (err: Error | string): void => {
        this.log.error(`Socket Error ${err}`);
        this.setState('error');
        this.emit('error', err);
    };

    #onSocketData = (data: Buffer): void => {
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
                if (this.buffer[1] & 0x80) {
                    const errorCode = this.buffer[2];
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
                        `unknown function code: 0x${this.buffer[1].toString(16)}, 0x${this.buffer[2].toString(16)}`,
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

    #onError = (): void => {
        this.log.error('Client in error state.');
        this.socket?.destroy();
    };

    #onSend = (pdu: Buffer, unitId: number): void => {
        this.log.debug('Sending pdu to the socket.');
        const pkt = new Put()
            .word8((unitId === undefined ? this.unitId : unitId) || 0) // unit id
            .put(pdu); // the actual pdu

        const buf = pkt.buffer();
        const crc16 = crc16modbus(buf);
        this.socket?.write(pkt.word16le(crc16).buffer());
    };

    connect(): void {
        this.setState('connect');

        if (!this.socket) {
            this.socket = new Socket();

            this.socket.on('connect', this.#onSocketConnect);
            this.socket.on('close', this.#onSocketClose);
            this.socket.on('error', this.#onSocketError);
            this.socket.on('data', this.#onSocketData);
        }

        this.socket.connect(this.tcp.port, this.tcp.host);
    }

    reconnect(): void {
        if (!this.inState('closed')) {
            return;
        }

        this.closedOnPurpose = false;
        this.#reconnect = true;
        this.log.debug('Reconnecting client.');
        this.socket?.end();
    }

    close(): void {
        this.closedOnPurpose = true;
        this.log.debug('Closing client on purpose.');
        this.socket?.end();
    }
}
