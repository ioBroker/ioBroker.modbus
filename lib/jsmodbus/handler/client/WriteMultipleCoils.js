'use strict';

const Stampit = require('stampit');
const Put     = require('put');


module.exports = Stampit()
    .init(function () {
        const FC = 15;

        let init = () => this.addResponseHandler(FC, onResponse);

        let onResponse = (unitId, pdu, cb) => {
            const fc           = pdu.readUInt8(0);
            const startAddress = pdu.readUInt16BE(1);
            const quantity     = pdu.readUInt16BE(3);
    
            let resp = {
                unitId:       unitId,
                fc:           fc,
                startAddress: startAddress,
                quantity:     quantity
            };

            if (fc !== FC) {
                cb(`WriteMultipleCoils: Invalid FC ${fc}`);
            } else {
                cb(null, resp);
            }
        };

        this.writeMultipleCoils = (unitId, startAddress, data, N) => {
            return new Promise((resolve, reject) => {
                let pdu = Put().word8(FC).word16be(startAddress);

                if (data instanceof Buffer) {
                    pdu.word16be(N).word8(data.length).put(data);
                } else if (data instanceof Array) {
                    if (data.length > 1968) {
                        reject('Length is too big');
                        return;
                    }

                    const byteCount = Math.ceil(data.length / 8);
                    let curByte = 0;
                    let cntr    = 0;

                    pdu.word16be(data.length).word8(byteCount);

                    for (let i = 0; i < data.length; i += 1) {
                        curByte += data[i] ? Math.pow(2, cntr) : 0;

                        cntr = (cntr + 1) % 8;

                        if (cntr === 0 || i === coils.length - 1 ) {
                            pdu.word8(curByte);
                            curByte = 0;
                        }
                    }
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
