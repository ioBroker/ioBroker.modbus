'use strict';

const Stampit      = require('stampit');
const StateMachine = require('stampit-state-machine');
const EventBus     = require('stampit-event-bus');

const ExceptionMessage = {
    0x01: 'ILLEGAL FUNCTION',
    0x02: 'ILLEGAL DATA ADDRESS',
    0x03: 'ILLEGAL DATA VALUE',
    0x04: 'SLAVE DEVICE FAILURE',
    0x05: 'ACKNOWLEDGE',
    0x06: 'SLAVE DEVICE BUSY',
    0x08: 'MEMORY PARITY ERROR',
    0x0A: 'GATEWAY PATH UNAVAILABLE',
    0x0B: 'GATEWAY TARGET DEVICE FAILED TO RESPOND'
};

module.exports = Stampit()
    .compose(StateMachine, EventBus)
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

        let responseHandler = {};
        let currentRequest  = null;

        let reqFifo = [];

        let init = () => {
            this.options.timeout = this.options.timeout || (5 * 1000); // 5s

            this.on('data', onData);
            this.on('newState_ready', flush);
            this.on('newState_closed', onClosed);
        };

        let flush = () => {
            if (reqFifo.length) {
                currentRequest = reqFifo.shift();

                currentRequest.timeout = setTimeout(() => {
                    currentRequest.cb && currentRequest.cb({err: 'timeout', timeout: this.options.timeout});
                    this.emit('trashCurrentRequest');
                    this.log.error('Request timed out.');
                    this.setState('error');
                }, this.options.timeout);

                this.setState('waiting');
                this.emit('send', currentRequest.pdu, currentRequest.unitId);
            }
        };

        let onClosed = () => {
            if (currentRequest) {
                this.log.debug('Clearing timeout of the current request.');
                clearTimeout(currentRequest.timeout);
            }

            this.log.debug('Cleaning up request fifo.');
            reqFifo = [];
        };

        let handleErrorPDU = pdu => {
            const errorCode = pdu.readUInt8(0);

            // if error code is smaller than 0x80
            // ths pdu describes no error

            if (errorCode < 0x80) {
                return false;
            }

            // pdu describes an error
            const exceptionCode = pdu.readUInt8(1);
            const message = ExceptionMessage[exceptionCode];

            const err = {
                errorCode,
                exceptionCode,
                message
            };

            // call the desired deferred
            currentRequest.cb && currentRequest.cb(err);

            return true;
        };

        /**
          *  Handle the incoming data, cut out the mbap
          *  packet and send the pdu to the listener
          */
        let onData = (pdu, unitId) => {
            if (!currentRequest) {
                this.log.debug('No current request.');
                return;
            }

            clearTimeout(currentRequest.timeout);

            try {
                // check pdu for error
                if (handleErrorPDU(pdu)) {
                    this.log.debug('Received pdu describes an error.');
                    currentRequest = null;
                    this.setState('ready');
                    return;
                }
            } catch (err) {
                // ignore
            }

            // handle pdu
            const handler = responseHandler[currentRequest.fc];
            if (!handler) {
                this.log.warn(`Found no handler for fc ${currentRequest.fc}`);
                throw new Error(`No handler implemented for fc ${currentRequest.fc}`);
            }

            try {
                handler(unitId, pdu, currentRequest.cb);
            } catch (err) {
                this.log.warn(`Error in handler for ${currentRequest.fc}: ${err}`);
            }

            this.setState('ready');
        };

        this.addResponseHandler = (fc, handler) => {
            responseHandler[fc] = handler;
            return this;
        };

        this.queueRequest = (unitId, fc, pdu, cb) => {
            reqFifo.push({unitId, fc, pdu, cb});

            if (this.inState('ready')) {
                flush();
            }
        };

        init();
    });
