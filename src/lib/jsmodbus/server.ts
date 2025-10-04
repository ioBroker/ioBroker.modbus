import type { ModbusTransport } from '../../types';

import ModbusServerTcp from './transports/modbus-server-tcp';
import ModbusServerSerial from './transports/modbus-server-serial';

import ModbusServerCore from './modbus-server-core';

export default function serverModbusFactory(transport: ModbusTransport): typeof ModbusServerCore {
    switch (transport) {
        case 'tcp':
            return ModbusServerTcp;
        case 'serial':
            return ModbusServerSerial;
        default:
            throw new Error(`Invalid transport: ${transport}`);
    }
}
