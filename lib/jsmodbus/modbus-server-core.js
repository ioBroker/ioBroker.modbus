'use strict';

const Stampit  = require('stampit');
const Put      = require('put');
const EventBus = require('stampit-event-bus');

const core = Stampit()
    .compose(EventBus)
    .init(function () {
        this.log = this.options && this.options.log;

        if (!this.log) {
            this.log =  {
                log:   () => console.log.apply(console, arguments),
                error: () => console.error.apply(console, arguments),
                warn:  () => console.warn.apply(console, arguments),
                debug: () => console.log.apply(console, arguments)
            };
        }
        let data = {
            coils:    null,
            holding:  null,
            input:    null,
            discrete: null,
        };

        let handler = {};

        let init = () => {
            if (!this.coils) {
                data.coils = new Buffer(1024);
            } else {
                data.coils = this.coils;
            }

            if (!this.holding) {
                data.holding = new Buffer(1024);
            } else {
                data.holding = this.holding;
            }

            if (!this.input) {
                data.input = new Buffer(1024);
            } else {
                data.input = this.input;
            }
            if (!this.discrete) {
                data.discrete = new Buffer(1024);
            } else {
                data.discrete = this.discrete;
            }
        };

        this.onData = (pdu, callback) => {
            // get fc and byteCount in advance
            const fc          = pdu.readUInt8(0);
            // const byteCount   = pdu.readUInt8(1);

            // get the pdu handler
            const reqHandler = handler[fc];

            if (!reqHandler) {
                // write a error/exception pkt to the
                // socket with error code fc + 0x80 and
                // exception code 0x01 (Illegal Function)

                this.log.debug('no handler for fc', fc);

                callback(Put().word8(fc + 0x80).word8(0x01).buffer());
            } else {
                reqHandler(pdu, response => {
                    callback(response);
                });
            }
        };

        this.setRequestHandler = (fc, callback) => {
            this.log.debug('setting request handler', fc);
            handler[fc] = callback;
            return this;
        };

        this.getCoils    = () => data.coils;
        this.getInput    = () => data.input;
        this.getHolding  = () => data.holding;
        this.getDiscrete = () => data.discrete;

        init();
    });

module.exports = core;
