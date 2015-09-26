// 'RIR' contains the "Function Code" that we are going to invoke on the remote device
var FC = require('modbus-stack').FUNCTION_CODES;

// IP and port of the MODBUS slave, default port is 502
var client = require('modbus-stack/client').createClient(502, 'localhost');

// 'req' is an instance of the low-level `ModbusRequestStack` class
var req = client.request(FC.READ_INPUT_REGISTERS, // Function Code: 4
    0,   // Start at address 0
    50)  // Read 50 contiguous registers from 0
    .on('error', function (err) {
       console.error(err);
    });

// 'response' is emitted after the entire contents of the response has been received.
req.on('response', function(registers) {
    // An Array of length 50 filled with Numbers of the current registers.
    console.log(registers);
    client.end();
});