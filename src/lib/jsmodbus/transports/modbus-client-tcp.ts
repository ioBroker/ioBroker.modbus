import Put from '../../Put';
import { Socket } from 'node:net';
import ModbusClientCore from '../modbus-client-core';

export default class ModbusClientTCP extends ModbusClientCore {
    private reqId = 0;
    private currentRequestId = 0;
    private closedOnPurpose = false;
    #reconnect = false;
    private buffer = Buffer.alloc(0);
    private trashRequestId: number | undefined;
    private socket: Socket | null = null;
    private tcp: {
        host: string;
        port: number;
        protocolVersion: number;
        autoReconnect: boolean;
        reconnectTimeout: number;
    };
    private unitId: number;

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
        this.on('trashCurrentRequest', this.#onTrashCurrentRequest);
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

        while (this.buffer.length > 8) {
            // http://www.simplymodbus.ca/TCP.htm
            // 1. extract mbap
            const id = this.buffer.readUInt16BE(0);
            const len = this.buffer.readUInt16BE(4);
            const unitId = this.buffer.readUInt8(6);

            // 2. extract pdu
            if (this.buffer.length < 7 + len - 1) {
                break;
            }

            const pdu = this.buffer.slice(7, 7 + len - 1);

            if (id === this.trashRequestId) {
                this.log.debug('current mbap contains trashed request id.');
            } else {
                // emit data event and let the
                // listener handle the pdu
                this.emit('data', pdu, unitId);
            }

            this.buffer = this.buffer.slice(pdu.length + 7, this.buffer.length);
        }
    };

    #onError = (): void => {
        this.log.error(`Client in error state.`);
        this.socket?.destroy();
    };

    #onSend = (pdu: Buffer, unitId?: number): void => {
        this.reqId = (this.reqId + 1) % 0xffff;

        const pkt = new Put()
            .word16be(this.reqId) // transaction id
            .word16be(this.tcp.protocolVersion) // protocol version
            .word16be(pdu.length + 1) // pdu length
            .word8((unitId === undefined ? this.unitId : unitId) || 0) // unit id
            .put(pdu) // the actual pdu
            .buffer();

        this.currentRequestId = this.reqId;

        this.socket?.write(pkt);
    };

    #onTrashCurrentRequest = (): void => {
        this.trashRequestId = this.currentRequestId;
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
