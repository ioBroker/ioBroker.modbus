import type { ModbusTransport } from '../../types';

import ModbusClientSerial from './transports/modbus-client-serial';
import ModbusClientTcp from './transports/modbus-client-tcp';
import ModbusClientRtu from './transports/modbus-client-tcp-rtu';
import ModbusClientTcpSsl from './transports/modbus-client-tcp-ssl';

import ModbusClientCore from './modbus-client-core';

export default function ClientModbusFactory(transport: ModbusTransport): typeof ModbusClientCore {
    switch (transport) {
        case 'tcp':
            return ModbusClientTcp;
        case 'tcprtu':
            return ModbusClientRtu;
        case 'tcp-ssl':
            return ModbusClientTcpSsl;
        case 'serial':
            return ModbusClientSerial;
        default:
            throw new Error(`Invalid transport: ${transport}`);
    }
}