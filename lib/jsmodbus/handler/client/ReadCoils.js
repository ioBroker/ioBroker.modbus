'use strict';

const Stampit = require('stampit');
const Put     = require('put');

module.exports = Stampit()
    .init(function () {
        const FC = 1;
    
        let init = () => this.addResponseHandler(FC, onResponse);
    
        let onResponse = (unitId, pdu, cb) => {
            let fc          = pdu.readUInt8(0);
            if (fc !== FC) {
                cb(`ReadCoils: Invalid FC ${fc}`);
            } else {
                let byteCount = pdu.readUInt8(1);
                // let bitCount    = byteCount * 8;
                let resp = {
                    unitId,
                    fc:        fc,
                    byteCount: byteCount,
                    payload:   pdu.slice(2),
                    data:      []
                };

                let counter = 0;
                for (let i = 0; i < byteCount; i+=1) {
                    let h = 1, cur = pdu.readUInt8(2 + i);
                    for (let j = 0; j < 8; j++) {
                        resp.data[counter] = (cur & h) > 0 ;
                        h = h << 1;
                        counter += 1;
                    }
                }

                cb && cb(null, resp);
            }
        };

        this.readCoils = (unitId, start, quantity) => {
            return new Promise((resolve, reject) => {
                let pdu = Put().word8(FC).word16be(start).word16be(quantity).buffer();

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
