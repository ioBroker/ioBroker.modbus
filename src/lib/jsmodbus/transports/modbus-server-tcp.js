'use strict';
const stampit = require('stampit');
const ModbusServerCore = require('../modbus-server-core.js');
const StateMachine = require('stampit-state-machine');
const Put = require('put');
const net = require('node:net');

module.exports = stampit()
    .compose(ModbusServerCore)
    .compose(StateMachine)
    .init(function () {
        let server;
        let socketCount = 0;
        let fifo = [];
        let clients = [];
        let buffer = Buffer.alloc(0);

        let init = () => {
            let tcp = this.options.tcp;
            tcp.port = tcp.port || 502;
            tcp.hostname = tcp.hostname || '0.0.0.0';

            server = net.createServer();

            server.on('connection', s => {
                this.log.debug('new connection', s.address());
                clients.push(s);
                initiateSocket(s);
                this.emit('connection', s.address());
            });

            server.on('disconnect', s => this.emit('close', s.address()));

            server.listen(tcp.port, tcp.hostname, err => {
                if (err) {
                    this.log.debug('error while listening', err);
                    this.emit('error', err);
                }
            });

            this.log.debug('server is listening on port', `${tcp.hostname}:${tcp.port}`);
            this.on('newState_ready', flush);
            this.setState('ready');
        };

        let onSocketEnd = (socket, socketId) => {
            return () => {
                this.emit('close');
                this.log.debug('connection closed, socket', socketId);
                //clients[socketId-1].destroy();
                delete clients[socketId - 1];
            };
        };

        let onSocketData = (socket, _socketId) => {
            return data => {
                buffer = Buffer.concat([buffer, data]);

                while (buffer.length > 8) {
                    // 1. extract mbap

                    const len = buffer.readUInt16BE(4);
                    const request = {
                        transId: buffer.readUInt16BE(0),
                        protocolVer: buffer.readUInt16BE(2),
                        untiId: buffer.readUInt8(6),
                    };

                    // 2. extract pdu
                    if (buffer.length < 7 + len - 1) {
                        break; // wait for next bytes
                    }

                    const pdu = buffer.slice(7, 7 + len - 1);

                    // emit data event and let the
                    // listener handle the pdu

                    fifo.push({ request, pdu, socket });

                    flush();

                    buffer = buffer.slice(pdu.length + 7, buffer.length);
                }
            };
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
                this.log.debug('sending tcp data');
                let pkt = Put()
                    .word16be(current.request.transId) // transaction id
                    .word16be(current.request.protocolVer) // protocol version
                    .word16be(response.length + 1) // pdu length
                    .word8(current.request.untiId) // unit id
                    .put(response) // the actual pdu
                    .buffer();

                current.socket.write(pkt);
                this.setState('ready');
            });
        };

        let onSocketError = (_socket, _socketCount) => {
            return e => {
                this.emit('error', e);
                this.log.error('Socket error', e);
            };
        };

        let initiateSocket = socket => {
            socketCount += 1;
            socket.on('end', onSocketEnd(socket, socketCount));
            socket.on('data', onSocketData(socket, socketCount));
            socket.on('error', onSocketError(socket, socketCount));
        };

        this.close = cb => {
            for (let c in clients) {
                if (Object.prototype.hasOwnProperty.call(clients, c)) {
                    clients[c].destroy();
                }
            }

            server.close(() => {
                server.unref();
                cb && cb();
            });
        };

        this.getClients = () => clients;

        init();
    });
