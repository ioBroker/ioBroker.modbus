'use strict';
const stampit = require('stampit');
const Put = require('put');
const tls = require('node:tls');
const fs = require('node:fs');
const ModbusCore = require('../modbus-client-core.js');

module.exports = stampit()
    .compose(ModbusCore)
    .init(function () {
        let reqId = 0;
        let currentRequestId = reqId;
        let closedOnPurpose = false;
        let reconnect = false;
        let buffer = Buffer.alloc(0);
        let trashRequestId;
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
            this.on('trashCurrentRequest', onTrashCurrentRequest);
            //this.on('stateChanged', this.log.debug);
        };

        let connect = () => {
            this.setState('connect');

            if (!socket) {
                // Prepare SSL/TLS options
                const sslOptions = {
                    host: this.options.tcp.host,
                    port: this.options.tcp.port,
                    rejectUnauthorized: this.options.ssl?.rejectUnauthorized !== false,
                };

                // Load SSL certificates if provided
                try {
                    if (this.options.ssl?.cert && fs.existsSync(this.options.ssl.cert)) {
                        sslOptions.cert = fs.readFileSync(this.options.ssl.cert);
                        this.log.debug('SSL certificate loaded from:', this.options.ssl.cert);
                    }

                    if (this.options.ssl?.key && fs.existsSync(this.options.ssl.key)) {
                        sslOptions.key = fs.readFileSync(this.options.ssl.key);
                        this.log.debug('SSL private key loaded from:', this.options.ssl.key);
                    }

                    if (this.options.ssl?.ca && fs.existsSync(this.options.ssl.ca)) {
                        sslOptions.ca = fs.readFileSync(this.options.ssl.ca);
                        this.log.debug('SSL CA certificate loaded from:', this.options.ssl.ca);
                    }
                } catch (err) {
                    this.log.error('Error loading SSL certificates:', err.message);
                    this.setState('error');
                    this.emit('error', err);
                    return;
                }

                socket = tls.connect(sslOptions);
                socket.on('secureConnect', onSocketConnect);
                socket.on('close', onSocketClose);
                socket.on('error', onSocketError);
                socket.on('data', onSocketData);
            }
        };

        let onSocketConnect = () => {
            this.log.debug('SSL/TLS connection established');

            // Log certificate information for debugging
            if (socket.getPeerCertificate) {
                const cert = socket.getPeerCertificate();
                if (cert && cert.subject) {
                    this.log.debug('Connected to SSL server with certificate subject:', cert.subject.CN || 'Unknown');
                }
            }

            this.emit('connect');
            this.setState('ready');
        };

        let onSocketClose = hadErrors => {
            this.log.debug('SSL/TLS socket closed with error', hadErrors);

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
            this.log.error('SSL/TLS Socket Error', err);
            this.setState('error');
            this.emit('error', err);
        };

        let onSocketData = data => {
            buffer = Buffer.concat([buffer, data]);

            while (buffer.length > 8) {
                // http://www.simplymodbus.ca/TCP.htm
                // 1. extract mbap
                const id = buffer.readUInt16BE(0);
                //const protId = buffer.readUInt16BE(2);
                const len = buffer.readUInt16BE(4);
                const unitId = buffer.readUInt8(6);

                // 2. extract pdu
                if (buffer.length < 7 + len - 1) {
                    break;
                }

                const pdu = buffer.slice(7, 7 + len - 1);

                if (id === trashRequestId) {
                    this.log.debug('current mbap contains trashed request id.');
                } else {
                    // emit data event and let the
                    // listener handle the pdu
                    this.emit('data', pdu, unitId);
                }

                buffer = buffer.slice(pdu.length + 7, buffer.length);
            }
        };

        let onError = () => {
            this.log.error(`SSL/TLS Client in error state.`);
            socket.destroy();
        };

        let onSend = (pdu, unitId) => {
            reqId = (reqId + 1) % 0xffff;

            let pkt = Put()
                .word16be(reqId) // transaction id
                .word16be(this.options.tcp.protocolVersion) // protocol version
                .word16be(pdu.length + 1) // pdu length
                .word8((unitId === undefined ? this.options.unitId : unitId) || 0) // unit id
                .put(pdu) // the actual pdu
                .buffer();

            currentRequestId = reqId;

            socket.write(pkt);
        };

        let onTrashCurrentRequest = () => (trashRequestId = currentRequestId);

        this.connect = () => {
            connect();
            return this;
        };

        this.reconnect = () => {
            if (!this.inState('closed')) {
                return this;
            }

            closedOnPurpose = false;
            reconnect = true;

            this.log.debug('Reconnecting SSL/TLS client.');

            socket.end();

            return this;
        };

        this.close = () => {
            closedOnPurpose = true;
            this.log.debug('Closing SSL/TLS client on purpose.');
            socket.end();
            return this;
        };

        init();
    });
