'use strict';

const Stampit = require('stampit');
const Put     = require('put');

module.exports = Stampit()
    .init(function () {
        const FC = 5;
        let init = () => {
            this.log.debug('initiating write single coil request handler.');
            this.responseDelay = this.responseDelay || 0;
            this.setRequestHandler(FC, onRequest);
        };
    
        let _onRequest = (pdu, cb) => {
            if (pdu.length !== 5) {
                cb(Put().word8(0x85).word8(0x02).buffer());
            } else {
                // const fc      = pdu.readUInt8(0);
                const address = pdu.readUInt16BE(1);
                const value   = (pdu.readUInt16BE(3) === 0xFF00);

                if (pdu.readUInt16BE(3) !== 0x0000 && pdu.readUInt16BE(3) !== 0xFF00) {
                    cb(Put().word8(0x85).word8(0x03).buffer());
                } else {
                    this.emit('preWriteSingleCoilRequest', address, value);

                    let mem = this.getCoils();

                    if (address + 1 > mem.length * 8) {
                        cb(Put().word8(0x85).word8(0x02).buffer());
                    } else {
                        let response = Put().word8(0x05).word16be(address).word16be(value ? 0xFF00 : 0x0000);
                        let oldValue = mem.readUInt8(Math.floor(address / 8));
                        let newValue;

                        if (value) {
                            newValue = oldValue | Math.pow(2, address % 8);
                        } else {
                            newValue = oldValue & ~Math.pow(2, address % 8);
                        }

                        mem.writeUInt8(newValue, Math.floor(address / 8));

                        this.emit('postWriteSingleCoilRequest', address, value);

                        cb(response.buffer());
                    }
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
