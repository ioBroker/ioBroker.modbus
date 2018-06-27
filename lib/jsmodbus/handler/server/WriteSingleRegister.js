'use strict';

const Stampit = require('stampit');
const Put     = require('put');

module.exports = Stampit()
    .init(function () {
        const FC = 6;
        let init = () => {
            this.log.debug('initiating write single register request handler.');
            this.responseDelay = this.responseDelay || 0;
            this.setRequestHandler(FC, onRequest);
        };
    
        let _onRequest = (pdu, cb) => {
            this.log.debug('handling write single register request.');

            if (pdu.length !== 5) {
                cb(Put().word8(0x86).word8(0x02).buffer());
            } else {
                // const fc          = pdu.readUInt8(0);
                const address     = pdu.readUInt16BE(1);
                const byteAddress = address * 2;
                const value       = pdu.readUInt16BE(3);

                this.emit('preWriteSingleRegisterRequest', byteAddress, value);

                let mem = this.getHolding();

                if (byteAddress + 2 > mem.length) {
                    cb(Put().word8(0x86).word8(0x02).buffer());
                } else {
                    let response = Put().word8(0x06).word16be(address).word16be(value).buffer();
                    mem.writeUInt16BE(value, byteAddress);
                    this.emit('postWriteSingleRegisterRequest', byteAddress, value);
                    cb(response);
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
