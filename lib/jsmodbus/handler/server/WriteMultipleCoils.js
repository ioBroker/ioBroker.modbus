'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 15;
    let init = () => {
        this.log.debug('initiating write multiple coils request handler.');
        this.responseDelay = this.responseDelay || 0;
        this.setRequestHandler(FC, onRequest);
    };

    let _onRequest = (pdu, cb) => {
        this.log.debug('handling write multiple coils request.');

        if (pdu.length < 3) {
            this.log.warn(`wrong pdu length for coils: ${pdu.length}. Expected 3`);
            cb(Put().word8(0x8f).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const quantity = pdu.readUInt16BE(3);
            const byteCount = pdu.readUInt8(5);

            this.emit('preWriteMultipleCoilsRequest', start, quantity, byteCount);

            let mem = this.getCoils();

            // error response
            if (!quantity || start + quantity > mem.length * 8) {
                this.log.warn(
                    `FC${fc} request outside coils boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length * 8}`,
                );
                cb(Put().word8(0x8f).word8(0x02).buffer());
            } else {
                let response = Put().word8(0x0f).word16be(start).word16be(quantity).buffer();
                let oldValue;
                let newValue;
                let current = pdu.readUInt8(6);
                let j = 0;

                for (let i = start; i < start + quantity; i += 1) {
                    // reading old value from the coils register
                    oldValue = mem.readUInt8(Math.floor(i / 8));

                    // apply new value
                    if (Math.pow(2, j % 8) & current) {
                        newValue = oldValue | Math.pow(2, i % 8);
                    } else {
                        newValue = oldValue & ~Math.pow(2, i % 8);
                    }

                    // write to buffer
                    mem.writeUInt8(newValue, Math.floor(i / 8));

                    // read new value from request pdu
                    j += 1;

                    if (j % 8 === 0 && j < quantity) {
                        current = pdu.readUInt8(6 + Math.floor(j / 8));
                    }
                }

                this.emit('postWriteMultipleCoilsRequest', start, quantity, byteCount);

                cb(response);
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
