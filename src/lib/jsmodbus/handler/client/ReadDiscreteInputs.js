'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 2;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);

        // Check if this is an error response (FC + 0x80)
        if (fc === FC + 0x80) {
            // This is a ModBus error response for ReadDiscreteInputs
            const exceptionCode = pdu.readUInt8(1);
            const ExceptionMessage = {
                0x01: 'ILLEGAL FUNCTION',
                0x02: 'ILLEGAL DATA ADDRESS',
                0x03: 'ILLEGAL DATA VALUE',
                0x04: 'SLAVE DEVICE FAILURE',
                0x05: 'ACKNOWLEDGE',
                0x06: 'SLAVE DEVICE BUSY',
                0x08: 'MEMORY PARITY ERROR',
                0x0a: 'GATEWAY PATH UNAVAILABLE',
                0x0b: 'GATEWAY TARGET DEVICE FAILED TO RESPOND',
            };
            const message = ExceptionMessage[exceptionCode] || `Unknown exception code: ${exceptionCode}`;
            cb({
                errorCode: fc,
                exceptionCode,
                message: `ReadDiscreteInputs: ${message}`,
            });
        } else if (fc !== FC) {
            cb(`ReadDiscreteInputs: Invalid FC ${fc}`);
        } else {
            const byteCount = pdu.readUInt8(1);
            let counter = 0;
            const resp = {
                unitId,
                fc,
                byteCount,
                payload: pdu.slice(2),
                data: [],
            };

            for (let i = 0; i < byteCount; i++) {
                let h = 1,
                    cur = pdu.readUInt8(2 + i);
                for (let j = 0; j < 8; j += 1) {
                    resp.data[counter] = (cur & h) > 0;
                    h = h << 1;
                    counter += 1;
                }
            }

            cb && cb(null, resp);
        }
    };

    this.readDiscreteInputs = (unitId, start, quantity) => {
        return new Promise((resolve, reject) => {
            if (quantity > 2000) {
                return reject('quantity is too big');
            }

            let pdu = Put().word8be(FC).word16be(start).word16be(quantity).buffer();

            this.queueRequest(unitId, FC, pdu, (err, resp) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(resp);
                }
            });
        });
    };

    init();
});
