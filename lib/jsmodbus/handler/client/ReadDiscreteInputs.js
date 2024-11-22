'use strict';

const Stampit = require('stampit');
const Put = require('put');

module.exports = Stampit().init(function () {
    const FC = 2;

    const init = () => this.addResponseHandler(FC, onResponse);

    const onResponse = (unitId, pdu, cb) => {
        const fc = pdu.readUInt8(0);

        if (fc !== FC) {
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
