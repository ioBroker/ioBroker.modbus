'use strict';

const Stampit = require('stampit');
const Put     = require('put');

module.exports = Stampit()
    .init(function () {
        const FC = 2;

        let init = () => {
            this.log.debug('initiating read discrete inputs request handler.');
            this.responseDelay = this.responseDelay || 0;
            this.setRequestHandler(FC, onRequest);
        };

        let _onRequest = (pdu, cb) => {
            if (pdu.length !== 5) {
                this.log.warn(`wrong pdu length for discrete inputs: ${pdu.length}. Expected 5`);
                cb(Put().word8(0x82).word8(0x02).buffer());
            } else {
                const fc       = pdu.readUInt8(0);
                const start    = pdu.readUInt16BE(1);
                const quantity = pdu.readUInt16BE( 3);

                this.emit('readDiscreteInputsRequest', start, quantity);

                let mem = this.getDiscrete();

                if (!quantity || start + quantity > mem.length * 8) {
                    this.log.warn(`FC${fc} request outside discrete inputs boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length * 8}`);
                    cb(Put().word8(0x82).word8(0x02).buffer());
                } else {
                    let val = 0;
                    let thisByteBitCount = 0;
                    let response = Put().word8(0x02).word8(Math.floor(quantity / 8) + (quantity % 8 === 0 ? 0 : 1));

                    for (let totalBitCount = start; totalBitCount < start + quantity; totalBitCount += 1) {
                        let buf = mem.readUInt8(Math.floor(totalBitCount / 8));
                        let mask = 1 << (totalBitCount % 8);

                        if (buf & mask) {
                            val += 1 << (thisByteBitCount % 8)
                        }

                        thisByteBitCount += 1;

                        if (thisByteBitCount % 8 === 0 || totalBitCount === (start + quantity) - 1) {
                            response.word8(val);
                            val = 0;
                        }
                    }

                    // this.log.debug(`FC${fc} finished read discrete inputs request: from ${start}, len ${quantity}`);
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
