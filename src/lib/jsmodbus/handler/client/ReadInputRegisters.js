'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 4;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);

        // Check if this is an error response (FC + 0x80)
        if (fc === FC + 0x80) {
            // This is a ModBus error response for ReadInputRegisters
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
                message: `ReadInputRegisters: ${message}`,
            });
        } else if (fc !== FC) {
            cb(`ReadInputRegisters: Invalid FC ${fc}`);
        } else {
            const byteCount = pdu.readUInt8(1);

            const resp = {
                unitId,
                fc,
                byteCount,
                payload: pdu.slice(2),
                register: [],
            };
            const registerCount = byteCount / 2;

            if (byteCount + 2 > pdu.byteLength) {
                cb(
                    `ReadInputRegisters: Response length is invalid. Received ${pdu.byteLength} bytes, expected ${byteCount + 2} bytes`,
                );
                return;
            }

            for (let i = 0; i < registerCount; i++) {
                resp.register.push(pdu.readUInt16BE(2 + i * 2));
            }

            cb && cb(null, resp);
        }
    };

    this.readInputRegisters = (unitId, start, quantity) => {
        return new Promise((resolve, reject) => {
            const pdu = Put().word8be(FC).word16be(start).word16be(quantity).buffer();

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
