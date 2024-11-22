'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 3;
    let init = () => {
        this.log.debug('initiating read holding registers request handler.');
        this.responseDelay = this.responseDelay || 0;
        this.setRequestHandler(FC, onRequest);
    };

    let _onRequest = (pdu, cb) => {
        if (pdu.length !== 5) {
            this.log.warn(`wrong pdu length for holding registers: ${pdu.length}. Expected 5`);
            cb(Put().word8(0x83).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const byteStart = start * 2;
            const quantity = pdu.readUInt16BE(3);

            this.emit('readHoldingRegistersRequest', byteStart, quantity);

            let mem = this.getHolding();

            if (!quantity || byteStart + quantity * 2 > mem.length) {
                this.log.warn(
                    `FC${fc} request outside register boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length / 2}`,
                );
                cb(Put().word8(0x83).word8(0x02).buffer());
            } else {
                let response = Put()
                    .word8(0x03)
                    .word8(quantity * 2);

                for (let i = byteStart; i < byteStart + quantity * 2; i += 2) {
                    response.word16be(mem.readUInt16BE(i));
                }

                // this.log.debug(`FC${fc} finished read holding register request: from ${start}, len ${quantity}`);
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
