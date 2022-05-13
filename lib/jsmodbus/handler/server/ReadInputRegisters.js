'use strict';

const Stampit = require('stampit');
const Put     = require('put');

module.exports = Stampit()
    .init(function () {
        const FC = 4;
        let init = () => {
            this.log.debug('initiating read input registers request handler.');
            this.responseDelay = this.responseDelay || 0;
            this.setRequestHandler(FC, onRequest);
        };

        let _onRequest = (pdu, cb) => {
            if (pdu.length !== 5) {
                this.log.warn(`wrong pdu length for input registers: ${pdu.length}. Expected 5`);
                cb(Put().word8(0x84).word8(0x02).buffer());
            } else {
                const fc          = pdu.readUInt8(0);
                const start       = pdu.readUInt16BE(1);
                const byteStart   = start * 2;
                const quantity    = pdu.readUInt16BE(3);

                this.emit('readInputRegistersRequest', byteStart, quantity);

                let mem = this.getInput();

                if (!quantity || byteStart + (quantity * 2) > mem.length) {
                    this.log.warn(`FC${fc} request outside inputs registers boundaries: address ${start}, len ${quantity}. Expected from 0 to ${mem.length / 2}`);
                    cb(Put().word8(0x84).word8(0x02).buffer());
                } else {
                    let response = Put().word8(0x04).word8(quantity * 2);

                    for (let i = byteStart; i < byteStart + (quantity * 2); i += 2) {
                        response.word16be(mem.readUInt16BE(i));
                    }

                    cb(response.buffer());
                }
            }
        };

        let onRequest = (pdu, cb) => {
            if (this.responseDelay) {
                setTimeout(_onRequest, this.responseDelay, pdu, cb);
            } else {
                setImmediate(_onRequest, pdu, cb);
            }
        };

        init();
    });
