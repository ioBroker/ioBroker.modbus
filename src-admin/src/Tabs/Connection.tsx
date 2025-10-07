import React from 'react';

import type { AdminConnection, IobTheme, ThemeName, ThemeType } from '@iobroker/adapter-react-v5';
import { type ConfigItemPanel, JsonConfigComponent } from '@iobroker/json-config';

import type { Modbus } from '@iobroker/modbus';

interface ConnectionProps {
    common: ioBroker.InstanceCommon;
    native: Modbus.ModbusAdapterConfig;
    instance: number;
    adapterName: string;
    socket: AdminConnection;
    changeNative: (native: ioBroker.AdapterConfig) => void;
    themeName: ThemeName;
    themeType: ThemeType;
    theme: IobTheme;
    systemConfig: ioBroker.SystemConfigObject;
}

const schema: ConfigItemPanel = {
    type: 'panel',
    label: 'Connection',
    items: {
        type: {
            newLine: true,
            type: 'select',
            label: 'TCP/Serial RTU',
            options: [
                { value: 'tcp', label: 'TCP' },
                { value: 'serial', label: 'Serial' },
                { value: 'tcprtu', label: 'RTU over TCP (Master)' },
                { value: 'tcp-ssl', label: 'TCP with SSL/TLS (Master)' },
            ],
            xs: 12,
            sm: 6,
            lg: 4,
        },
        slave: {
            type: 'select',
            label: 'Mode',
            hidden: 'data.type !== "tcp" && data.type !== "serial"',
            options: [
                { value: '0', label: 'Master' },
                { value: '1', label: 'Slave' },
            ],
            sm: 6,
            lg: 2,
        },
        _delimiter: {
            newLine: true,
            type: 'divider',
            xs: 12,
            height: 2,
        },
        // Serial options
        comName: {
            newLine: true,
            type: 'selectSendTo',
            label: 'Port',
            hidden: 'data.type !== "serial"',
            command: 'listUart',
            data: {},
            manual: true,
            noTranslation: true,
            xs: 12,
            sm: 6,
            lg: 4,
        },
        baudRate: {
            type: 'select',
            label: 'Baud rate',
            hidden: 'data.type !== "serial"',
            options: [
                {
                    value: 110,
                    label: '110',
                },
                {
                    value: 150,
                    label: '150',
                },
                {
                    value: 300,
                    label: '300',
                },
                {
                    value: 600,
                    label: '600',
                },
                {
                    value: 1200,
                    label: '1200',
                },
                {
                    value: 2400,
                    label: '2400',
                },
                {
                    value: 4800,
                    label: '4800',
                },
                {
                    value: 9600,
                    label: '9600',
                },
                {
                    value: 19200,
                    label: '19200',
                },
                {
                    value: 38400,
                    label: '38400',
                },
                {
                    value: 56000,
                    label: '56000',
                },
                {
                    value: 57600,
                    label: '57600',
                },
                {
                    value: 115200,
                    label: '115200',
                },
            ],
            noTranslation: true,
            xs: 12,
            sm: 6,
            lg: 2,
        },
        dataBits: {
            type: 'select',
            label: 'Data bits',
            hidden: 'data.type !== "serial"',
            options: [
                {
                    value: 5,
                    label: '5',
                },
                {
                    value: 6,
                    label: '6',
                },
                {
                    value: 7,
                    label: '7',
                },
                {
                    value: 8,
                    label: '8',
                },
            ],
            noTranslation: true,
            xs: 12,
            sm: 6,
            lg: 2,
        },
        stopBits: {
            type: 'select',
            label: 'Stop bits',
            hidden: 'data.type !== "serial"',
            options: [
                {
                    value: 1,
                    label: '1',
                },
                {
                    value: 1.5,
                    label: '1.5',
                },
                {
                    value: 2,
                    label: '2',
                },
            ],
            noTranslation: true,
            xs: 12,
            sm: 6,
            lg: 2,
        },
        parity: {
            type: 'select',
            label: 'Parity',
            hidden: 'data.type !== "serial"',
            options: [
                {
                    value: 'none',
                    label: 'none',
                },
                {
                    value: 'even',
                    label: 'even',
                },
                {
                    value: 'mark',
                    label: 'mark',
                },
                {
                    value: 'odd',
                    label: 'odd',
                },
                {
                    value: 'space',
                    label: 'space',
                },
            ],
            noTranslation: true,
            xs: 12,
            sm: 6,
            lg: 2,
        },
        // TCP options
        bind: {
            type: 'ip',
            label: 'Bind address',
            hidden: 'data.type === "serial" || data.slave !== "1"',
            xs: 12,
            sm: 6,
            lg: 4,
        },
        host: {
            type: 'text',
            label: 'Slave address',
            help: 'IP address of the Modbus TCP server',
            hidden: 'data.type === "serial" || data.slave !== "0"',
            xs: 12,
            sm: 6,
            lg: 4,
        },
        port: {
            type: 'number',
            label: 'Port',
            default: 502,
            min: 1,
            max: 65535,
            hidden: 'data.type === "serial"',
            xs: 12,
            sm: 6,
            lg: 2,
        },
        _certs: {
            newLine: true,
            type: 'certificates',
            hidden: 'data.type !== "tcp-ssl"',
            noTranslation: true,
            xs: 12,
        },
        _delimiter1: {
            newLine: true,
            type: 'divider',
            xs: 12,
            height: 2,
        },
        deviceId: {
            newLine: true,
            type: 'number',
            label: 'Device ID',
            default: 1,
            min: 1,
            max: 247,
            help: 'Modbus device ID of the slave or default device ID for master mode',
            xs: 12,
            sm: 6,
            lg: 4,
        },
        multiDeviceId: {
            type: 'checkbox',
            label: 'Multi device IDs',
            hidden: 'data.slave === "1"',
            xs: 12,
            sm: 6,
            lg: 2,
        },
    },
};

export default function Connection(props: ConnectionProps): React.JSX.Element {
    return (
        <div style={{ width: '100%', minHeight: '100%' }}>
            <JsonConfigComponent
                common={props.common}
                socket={props.socket}
                themeName={props.themeName}
                themeType={props.themeType}
                adapterName="modbus"
                instance={props.instance || 0}
                isFloatComma={props.systemConfig.common.isFloatComma}
                dateFormat={props.systemConfig.common.dateFormat}
                schema={schema}
                onChange={(params): void => {
                    const native: Modbus.ModbusAdapterConfig = JSON.parse(JSON.stringify(props.native));
                    native.params = params as Modbus.ModbusParametersTyped;
                    props.changeNative(native);
                }}
                data={props.native.params}
                onError={() => {}}
                theme={props.theme}
                withoutSaveButtons
            />
        </div>
    );
}
