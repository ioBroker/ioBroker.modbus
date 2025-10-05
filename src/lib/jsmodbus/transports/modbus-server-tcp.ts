import ModbusServerCore from '../modbus-server-core';
import Put from '../../Put';
import { createServer, type Socket, type Server, type AddressInfo } from 'node:net';

export default class ModbusServerTcp extends ModbusServerCore {
    private server: Server;
    private socketCount = 0;
    private fifo: {
        socket: Socket;
        pdu: Buffer;
        request: {
            transId: number;
            protocolVer: number;
            unitId: number;
        };
    }[] = [];
    private clients: Socket[] = [];
    private buffer = Buffer.alloc(0);

    private tcp: {
        port: number;
        hostname: string;
    };

    constructor(options: {
        tcp: {
            port?: number;
            hostname?: string;
        };
        logger: ioBroker.Logger;
        timeout?: number;
        responseDelay?: number;
        coils?: Buffer;
        holding?: Buffer;
        input?: Buffer;
        discrete?: Buffer;
    }) {
        super(options);
        this.tcp = {
            port: options.tcp.port || 502,
            hostname: options.tcp.hostname || '0.0.0.0',
        };

        this.server = createServer();

        this.server.on('connection', s => {
            this.log.debug(`new connection ${JSON.stringify(s.address())}`);
            this.clients.push(s);
            this.#initiateSocket(s);
            this.emit('connection', s.address());
        });

        this.server.on('disconnect', s => this.emit('close', s.address()));

        this.server.listen(this.tcp.port, this.tcp.hostname, (): void => {
            this.log.debug(`server is listening on port ${this.tcp.hostname}:${this.tcp.port}`);
        });

        this.on('newState_ready', this.#flush);
        this.setState('ready');
    }

    #onSocketData = (socket: Socket): ((data: Buffer) => void) => {
        return (data: Buffer): void => {
            this.buffer = Buffer.concat([this.buffer, data]);

            while (this.buffer.length > 8) {
                // 1. extract mbap

                const len = this.buffer.readUInt16BE(4);
                const request = {
                    transId: this.buffer.readUInt16BE(0),
                    protocolVer: this.buffer.readUInt16BE(2),
                    unitId: this.buffer.readUInt8(6),
                };

                // 2. extract pdu
                if (this.buffer.length < 7 + len - 1) {
                    break; // wait for next bytes
                }

                const pdu = this.buffer.slice(7, 7 + len - 1);

                // emit data event and let the
                // listener handle the pdu

                this.fifo.push({ request, pdu, socket });

                this.#flush();

                this.buffer = this.buffer.slice(pdu.length + 7, this.buffer.length);
            }
        };
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
            this.log.debug('sending tcp data');
            const pkt = new Put()
                .word16be(current.request.transId) // transaction id
                .word16be(current.request.protocolVer) // protocol version
                .word16be(response.length + 1) // pdu length
                .word8(current.request.unitId) // unit id
                .put(response) // the actual pdu
                .buffer();

            current.socket.write(pkt);
            this.setState('ready');
        });
    };

    #initiateSocket = (socket: Socket): void => {
        this.socketCount += 1;
        socket.on('end', () => {
            this.emit('close');
            this.log.debug(`connection closed, socket ${JSON.stringify(socket.address())}`);
            const pos = this.clients.indexOf(socket);
            if (pos !== -1) {
                this.clients.splice(pos, 1);
            }
        });
        socket.on('data', this.#onSocketData(socket));
        socket.on('error', e => {
            this.emit('error', e);
            this.log.error(`Socket error ${e}`);
        });
    };

    close(cb?: () => void): void {
        for (const socket of this.clients) {
            socket?.destroy();
        }

        this.server.close(() => {
            this.server.unref();
            cb?.();
        });
    }

    getClients(): string[] {
        return this.clients?.map(it => (it?.address() as AddressInfo)?.address).filter(it => it) || [];
    }
}
