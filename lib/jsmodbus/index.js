'use strict';
const fs = require('node:fs');

function Modbus(type, transport) {
    let core = require(`${__dirname}/transports/modbus-${type}-${transport || 'tcp'}.js`);

    fs.readdirSync(`${__dirname}/handler/${type}`)
        .filter(file => file.substr(-3) === '.js')
        .forEach(file => {
            const handler = require(`${__dirname}/handler/${type}/${file}`);
            core = core.compose(handler);
            //core.handler[file.substr(0, file.length - 3)] = handler;
        });

    return core;
}

module.exports = Modbus;
