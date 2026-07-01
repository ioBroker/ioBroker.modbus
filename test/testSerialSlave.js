const assert = require('node:assert');
const path = require('node:path');

// Test that serial transport can be loaded
describe('Test serial slave transport', function () {
    it('Serial transport should be loadable', function () {
        // Test that the transport file exists and can be required
        const transportPath = path.join(__dirname, '../lib/jsmodbus/transports/modbus-server-serial.js');
        assert.doesNotThrow(() => {
            require(transportPath);
        });
    });

    it('Jsmodbus should support serial server transport', function () {
        const Modbus = require('../lib/jsmodbus/index.js');

        // Test that the jsmodbus library can load the serial server transport
        assert.doesNotThrow(() => {
            Modbus('server', 'serial');
        });
    });

    it('Serial transport should have required methods', function () {
        const SerialTransport = require('../lib/jsmodbus/transports/modbus-server-serial.js');

        // Test that the transport has the required structure
        assert.strictEqual(typeof SerialTransport, 'function');

        // Test that the transport has the stampit structure
        assert.strictEqual(typeof SerialTransport.compose, 'function');
        assert.strictEqual(typeof SerialTransport.init, 'function');
    });
});
