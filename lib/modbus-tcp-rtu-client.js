var stampit         = require('stampit'),
    Put             = require('put'),
    crc             = require('crc'),
    Net             = require('net'),
    ModbusCore      = require('jsmodbus/src/modbus-client-core.js');

module.exports = stampit()
    .compose(ModbusCore)
    .init(function () {
    
        var closedOnPurpose     = false,
            reconnect           = false,
            crc16,
            socket;
    
        var init = function () {

            this.setState('init');

            if (!this.unitId) { this.unitId = 0; }
            if (!this.protocolVersion) { this.protocolVersion = 0; }
            if (!this.port) { this.port = 502; }
            if (!this.host) { this.host = 'localhost'; }
            if (!this.autoReconnect) { this.autoReconnect = false; }
            if (!this.reconnectTimeout) { this.reconnectTimeout = 0; }

            this.on('send', onSend);
            this.on('newState_error', onError);

            this.on('stateChanged', this.log.debug);

        }.bind(this);

        var connect = function () {

            this.setState('connect');

            if (!socket) {

                socket = new Net.Socket();

                socket.on('connect', onSocketConnect);
                socket.on('close', onSocketClose);
                socket.on('error', onSocketError);
                socket.on('data', onSocketData);
 
            }

            socket.connect(this.port, this.host);
       
        }.bind(this);

        var onSocketConnect = function ()  {
      
            this.emit('connect');
            this.setState('ready');
        
        }.bind(this);

        var onSocketClose = function (hadErrors) {

            this.log.debug('Socket closed with error', hadErrors);

            this.setState('closed'); 
            this.emit('close');

            if (!closedOnPurpose && (this.autoReconnect || reconnect)) {

                setTimeout(function () {

                    reconnect = false;
           
                    connect();
                }, this.reconnectTimeout || 0);
            
            } 
       
        }.bind(this);

        var onSocketError = function (err) {

            this.logError('Socket Error', err);

            this.setState('error');
            this.emit('error', err);
        
        }.bind(this);

        var onSocketData = function (data) {
 
            this.log.debug('received data');

            var cnt = 0;

            while (cnt < data.length) {

                // 1. there is no mbap
                // 2. extract pdu
                // remove just device ID
                if (data[cnt] !== this.unitId) {
                    // answer for wrong device
                    this.log.debug('received answer for wrong ID ' + data[0] + ', expected ' + this.unitId);
                    return;
                }
                // 0 - device ID
                // 1 - Function CODE
                // 2 - Bytes length
                // 3.. Data
                var len;
                var pdu;
                if (data[1] === 5 || data[1] === 6 || data[1] === 15 || data[1] === 16) {
                    len = 4;
                } else {
                    len = data[cnt + 2];
                }
                pdu = data.slice(cnt, cnt + len + 6); // 1 byte deviceID + 1 byte FC + 1 byte length  + 2 bytes CRC
                cnt += pdu.length; // + unitID

                if (crc.crc16modbus(pdu) === 0) { /* PDU is valid if CRC across whole PDU equals 0, else ignore and do nothing */
                    // emit data event and let the
                    // listener handle the pdu
                    this.emit('data', pdu.slice(1, pdu.length - 2));
                } else {
                    this.logError('Wrong CRC for frame: ' + data.join(', '));
                }
            }
        }.bind(this);

        var onError = function () {

            this.logError('Client in error state.');

            socket.destroy();

        }.bind(this);


        var onSend = function (pdu) {

            this.log.debug('Sending pdu to the socket.');

            var pkt = Put()
                .word8(this.unitId)	             // unit id
                .put(pdu);                        // the actual pdu

            var buf = pkt.buffer();
            crc16 = crc.crc16modbus(buf);
            pkt   = pkt.word16le(crc16).buffer();

            socket.write(pkt);
        
        }.bind(this);

        this.connect = function () {
       
            this.setState('connect');

            connect();

            return this;
        
        };

        this.reconnect = function () {

            if (!this.inState('closed')) {
                return this;
            }

            closedOnPurpose = false;
            reconnect       = true;

            this.log.debug('Reconnecting client.');

            socket.end();

            return this;
        
        };

        this.close = function () {

            closedOnPurpose = true;

            this.log.debug('Closing client on purpose.');

            socket.end();

            return this;

        };

        init();
    
    });
