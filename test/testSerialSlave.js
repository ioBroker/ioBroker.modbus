const { expect } = require('chai');
const path = require('node:path');

// Test that serial transport can be loaded
describe('Test serial slave transport', function () {
    it('Serial transport should be loadable', function () {
        // Test that the transport file exists and can be required
        const transportPath = path.join(__dirname, '../lib/jsmodbus/transports/modbus-server-serial.js');
        expect(() => {
            require(transportPath);
        }).to.not.throw();
    });

    it('Jsmodbus should support serial server transport', function () {
        const Modbus = require('../lib/jsmodbus/index.js');

        // Test that the jsmodbus library can load the serial server transport
        expect(() => {
            Modbus('server', 'serial');
        }).to.not.throw();
    });

    it('Serial transport should have required methods', function () {
        const SerialTransport = require('../lib/jsmodbus/transports/modbus-server-serial.js');

        // Test that the transport has the required structure
        expect(SerialTransport).to.be.a('function');

        // Test that the transport has the stampit structure
        expect(SerialTransport.compose).to.be.a('function');
        expect(SerialTransport.init).to.be.a('function');
    });
});
