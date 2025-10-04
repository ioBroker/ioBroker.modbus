'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 6;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);
        const registerAddress = pdu.readUInt16BE(1);
        const registerValue = pdu.readUInt16BE(3);

        const resp = {
            unitId,
            fc,
            registerAddress,
            registerValue,
            registerAddressRaw: pdu.slice(1, 2),
            registerValueRaw: pdu.slice(3, 2),
        };

        if (fc !== FC) {
            cb(`WriteSingleRegister: Invalid FC ${fc}`);
        } else {
            cb(null, resp);
        }
    };

    this.writeSingleRegister = (unitId, address, value) => {
        return new Promise((resolve, reject) => {
            const payload = value instanceof Buffer ? value : Put().word16be(value).buffer();
            const pdu = Put().word8be(FC).word16be(address).put(payload);

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
