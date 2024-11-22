'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 5;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);
        const outputAddress = pdu.readUInt16BE(1);
        const outputValue = pdu.readUInt16BE(3);

        const resp = {
            unitId,
            fc,
            outputAddress,
            outputValue: outputValue === 0x0000 ? false : outputValue === 0xff00 ? true : undefined,
        };

        if (fc !== FC) {
            cb(`WriteSingleCoil: Invalid FC ${fc}`);
        } else {
            cb(null, resp);
        }
    };

    this.writeSingleCoil = (unitId, address, value) => {
        return new Promise((resolve, reject) => {
            const payload = value instanceof Buffer ? value.readUInt8(0) > 0 : value;
            const pdu = Put()
                .word8be(FC)
                .word16be(address)
                .word16be(payload ? 0xff00 : 0x0000);

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
