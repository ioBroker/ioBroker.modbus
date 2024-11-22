'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 16;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);

        if (fc !== FC) {
            cb(`WriteMultipleRegisters: Invalid FC ${fc}`);
        } else {
            const startAddress = pdu.readUInt16BE(1);
            const quantity = pdu.readUInt16BE(3);

            const resp = {
                unitId,
                fc,
                startAddress,
                quantity,
            };
            cb(null, resp);
        }
    };

    this.writeMultipleRegisters = (unitId, startAddress, data) => {
        return new Promise((resolve, reject) => {
            const pdu = Put().word8(FC).word16be(startAddress);
            if (data instanceof Buffer) {
                if (data.length / 2 > 0x007b) {
                    reject('Length is too big');
                    return;
                }

                pdu.word16be(data.length / 2)
                    .word8(data.length)
                    .put(data);
            } else if (data instanceof Array) {
                if (data.length > 0x007b) {
                    reject('Length is too big');
                    return;
                }

                const byteCount = Math.ceil(data.length * 2);
                pdu.word16be(data.length).word8(byteCount);

                for (let i = 0; i < data.length; i += 1) {
                    pdu.word16be(data[i]);
                }
            } else {
                reject('Invalid data');
                return;
            }

            this.queueRequest(unitId, FC, pdu.buffer(), (err, resp) => {
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
