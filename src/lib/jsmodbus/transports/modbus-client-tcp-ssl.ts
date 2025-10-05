import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls';
import ModbusClientCore from '../modbus-client-core';
import Put from '../../Put';

export default class ModbusClientTcpSsl extends ModbusClientCore {
    private reqId = 0;
    private currentRequestId = 0;
    private closedOnPurpose = false;
    #reconnect = false;
    private buffer = Buffer.alloc(0);
    private trashRequestId: number | undefined;
    private socket: TLSSocket | null = null;
    private tcp: {
        host: string;
        port: number;
        protocolVersion: number;
        autoReconnect: boolean;
        reconnectTimeout: number;
    };
    private ssl: {
        rejectUnauthorized?: boolean;
        key: string;
        cert: string;
        ca?: string;
    };
    private unitId: number;

    constructor(options: {
        tcp: {
            host: string;
            port: number;
            protocolVersion?: number;
            autoReconnect?: boolean;
            reconnectTimeout?: number;
        };
        ssl: {
            rejectUnauthorized?: boolean;
            key: string;
            cert: string;
            ca?: string;
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
        this.ssl = options.ssl;
        this.unitId = options.unitId || 1;

        this.on('send', this.#onSend);
        this.on('newState_error', this.#onError);
        this.on('trashCurrentRequest', this.#onTrashCurrentRequest);
    }

    #onSocketConnect = (): void => {
        this.log.debug('SSL/TLS connection established');

        // Log certificate information for debugging
        if (this.socket?.getPeerCertificate) {
            const cert = this.socket.getPeerCertificate();
            if (cert?.subject) {
                this.log.debug(`Connected to SSL server with certificate subject: ${cert.subject.CN || 'Unknown'}`);
            }
        }

        this.emit('connect');
        this.setState('ready');
    };

    #onSocketClose = (hadErrors: boolean): void => {
        this.log.debug(hadErrors ? 'SSL/TLS socket closed with error' : 'SSL/TLS socket closed');

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
        this.log.error(`SSL/TLS Socket Error${err}`);
        this.setState('error');
        this.emit('error', err);
    };

    #onSocketData = (data: Buffer): void => {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length > 8) {
            // http://www.simplymodbus.ca/TCP.htm
            // 1. extract mbap
            const id = this.buffer.readUInt16BE(0);
            //const protId = buffer.readUInt16BE(2);
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
        this.log.error(`SSL/TLS Client in error state.`);
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
            // Prepare SSL/TLS options
            const sslOptions: ConnectionOptions = {
                host: this.tcp.host,
                port: this.tcp.port,
                rejectUnauthorized: this.ssl?.rejectUnauthorized !== false,
            };

            // Load SSL certificates if provided
            sslOptions.cert = this.ssl.cert;
            sslOptions.key = this.ssl.key;
            sslOptions.ca = this.ssl.ca;

            this.socket = connect(sslOptions);
            this.socket.on('secureConnect', this.#onSocketConnect);
            this.socket.on('close', this.#onSocketClose);
            this.socket.on('error', this.#onSocketError);
            this.socket.on('data', this.#onSocketData);
        }
    }

    reconnect(): void {
        if (!this.inState('closed')) {
            return;
        }

        this.closedOnPurpose = false;
        this.#reconnect = true;

        this.log.debug('Reconnecting SSL/TLS client.');

        this.socket?.end();
    }

    close(): void {
        this.closedOnPurpose = true;
        this.log.debug('Closing SSL/TLS client on purpose.');
        this.socket?.end();
    }
}
