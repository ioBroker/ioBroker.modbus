'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 16;
    let init = () => {
        this.log.debug('initiating write multiple registers request handler.');
        this.responseDelay = this.responseDelay || 0;
        this.setRequestHandler(FC, onRequest);
    };

    let _onRequest = (pdu, cb) => {
        if (pdu.length < 3) {
            this.log.warn(`wrong pdu length for holding registers: ${pdu.length}. Expected 3`);
            cb(Put().word8(0x90).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const byteStart = start * 2;
            const quantity = pdu.readUInt16BE(3);
            const byteCount = pdu.readUInt8(5);

            if (quantity > 123) {
                this.log.warn(`FC${fc} write length is too long: ${quantity}, len ${quantity}. Expected max len 123`);
                cb(Put().word8(0x90).word8(0x03).buffer());
            } else {
                this.emit('preWriteMultipleRegistersRequest', byteStart, quantity, byteCount);

                let mem = this.getHolding();

                if (!quantity || byteStart + quantity * 2 > mem.length) {
                    this.log.warn(
                        `FC${fc} request outside holding registers boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length / 2}`,
                    );
                    cb(Put().word8(0x90).word8(0x02).buffer());
                } else {
                    let response = Put().word8(0x10).word16be(start).word16be(quantity).buffer();
                    let j = 0;

                    for (let i = byteStart; i < byteStart + byteCount; i += 1) {
                        mem.writeUInt8(pdu.readUInt8(6 + j), i);
                        j++;
                    }

                    this.emit('postWriteMultipleRegistersRequest', byteStart, quantity, byteCount);

                    cb(response);
                }
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
