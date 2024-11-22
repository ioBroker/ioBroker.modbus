'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 4;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);

        if (fc !== FC) {
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
