import React from 'react';

import type { AdminConnection, IobTheme, ThemeName, ThemeType } from '@iobroker/adapter-react-v5';

import { address2alias, nonDirect2direct, direct2nonDirect, alias2address } from '../Components/Utils';
import { type ConfigItemPanel, JsonConfigComponent } from '@iobroker/json-config';
import type { Modbus } from '@iobroker/modbus';

interface SettingsProps {
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
        _header1: {
            newLine: true,
            type: 'header',
            label: 'Address and ID options',
            xs: 12,
        },
        _showAliasesInfo: {
            newLine: true,
            type: 'infoBox',
            text: 'showAliasesExplanation',
            title: 'Using aliases as address',
            xs: 12,
        },
        showAliases: {
            newLine: true,
            type: 'checkbox',
            label: 'Use aliases as address',
            xs: 12,
        },
        _showDirectAddresses: {
            newLine: true,
            type: 'infoBox',
            text: 'directAddressesExplanation',
            title: 'Using direct addresses',
            xs: 12,
            hidden: '!data.showAliases',
        },
        directAddresses: {
            type: 'checkbox',
            label: 'Use direct addresses by aliases',
            xs: 12,
            hidden: '!data.showAliases',
        },
        doNotRoundAddressToWord: {
            newLine: true,
            type: 'checkbox',
            label: 'Do not align addresses to word',
            help: 'doNotRoundAddressToWord_help',
            xs: 12,
        },
        doNotIncludeAdrInId: {
            type: 'checkbox',
            label: 'do not include address in ID',
            help: 'doNotIncludeAdrInId_help',
            hidden: '!!data.showAliases',
            xs: 12,
        },
        preserveDotsInId: {
            type: 'checkbox',
            label: 'preserve dots in ID',
            help: 'preserveDotsInId_help',
            xs: 12,
        },
        removeUnderscorePrefix: {
            type: 'checkbox',
            label: 'Remove leading "_" in ID if address is not included',
            xs: 12,
            hidden: '!!data.showAliases || !data.doNotIncludeAdrInId',
        },

        _header2: {
            newLine: true,
            type: 'header',
            label: 'Read/Write settings',
            xs: 12,
        },
        doNotUseWriteMultipleRegisters: {
            newLine: true,
            type: 'checkbox',
            hidden: 'data.slave === "1" || !!data.onlyUseWriteMultipleRegisters',
            label: 'Do not use "Write multiple registers"',
            help: 'Write only with FC5/FC6',
            xs: 12,
            md: 6,
        },
        onlyUseWriteMultipleRegisters: {
            type: 'checkbox',
            hidden: 'data.slave === "1" || !!data.doNotUseWriteMultipleRegisters',
            label: 'Use only "Write multiple registers"',
            help: 'Write only with FC15/FC16',
            xs: 12,
            md: 6,
        },
        maxBlock: {
            newLine: true,
            type: 'number',
            label: 'Max read request length',
            unit: 'registers',
            xs: 12,
            hidden: 'data.slave === "1"',
            md: 6,
        },
        maxBoolBlock: {
            type: 'number',
            label: 'Max read request length (booleans)',
            unit: 'registers',
            xs: 12,
            hidden: 'data.slave === "1"',
            md: 6,
        },
        alwaysUpdate: {
            newLine: true,
            type: 'checkbox',
            label: 'Update unchanged states',
            help: 'alwaysUpdate_help',
            hidden: 'data.slave === "1"',
            xs: 12,
            md: 6,
        },
        round: {
            type: 'number',
            min: 0,
            max: 20,
            label: 'Round Real to',
            md: 6,
        },

        _headerTimings: {
            newLine: true,
            type: 'header',
            label: 'Timings',
            xs: 12,
            hidden: 'data.slave === "1"',
        },
        poll: {
            newLine: true,
            type: 'number',
            min: 1,
            label: 'Poll delay',
            unit: 'ms',
            help: 'poll_help',
            xs: 12,
            hidden: 'data.slave === "1"',
        },
        recon: {
            type: 'number',
            min: 1,
            label: 'Reconnect time',
            unit: 'ms',
            xs: 12,
            hidden: 'data.slave === "1"',
        },
        timeout: {
            type: 'number',
            min: 100,
            label: 'Read timeout',
            unit: 'ms',
            help: 'timeout_help',
            xs: 12,
            hidden: 'data.slave === "1"',
        },
        pulseTime: {
            type: 'number',
            label: 'Pulse time',
            unit: 'ms',
            help: 'pulsetime_help',
            xs: 12,
            hidden: 'data.slave === "1"',
        },
        waitTime: {
            type: 'number',
            label: 'Wait time',
            unit: 'ms',
            help: 'waitTime_help',
            xs: 12,
            hidden: 'data.slave === "1"',
        },
        readInterval: {
            newLine: true,
            type: 'number',
            label: 'Read interval',
            unit: 'ms',
            help: 'readInterval_help',
            xs: 12,
            md: 6,
            hidden: 'data.slave === "1"',
        },
        writeInterval: {
            type: 'number',
            label: 'Write interval',
            unit: 'ms',
            help: 'writeInterval_help',
            xs: 12,
            md: 6,
            hidden: 'data.slave === "1"',
        },

        _headerOthers: {
            newLine: true,
            type: 'header',
            label: 'Others',
            xs: 12,
        },
        disableLogging: {
            type: 'checkbox',
            label: 'Disable connection error logging',
            help: 'disableLogging_help',
        },

        _headerSanitization: {
            newLine: true,
            type: 'header',
            label: 'Value Sanitization',
            xs: 12,
        },
        _sanitizationInfo: {
            newLine: true,
            type: 'infoBox',
            text: 'Enable automatic sanitization of invalid register values (NaN, Infinity, extreme float values). Configure per-register options in the register tables.',
            title: 'Value Sanitization',
            xs: 12,
        },
        enableSanitization: {
            newLine: true,
            type: 'checkbox',
            label: 'Enable value sanitization',
            help: 'Automatically detect and handle invalid values from Modbus registers',
            xs: 12,
        },
    },
};

export default function Settings(props: SettingsProps): React.JSX.Element {
    const [directAddresses, setDirectAddresses] = React.useState(props.native.params.directAddresses);
    const [showAliases, setShowAliases] = React.useState(props.native.params.showAliases);

    return (
        <div style={{ width: 'calc(100% - 8px)', minHeight: '100%' }}>
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
                    if (native.params.showAliases !== showAliases) {
                        setShowAliases(native.params.showAliases);
                        ['disInputs', 'inputRegs', 'holdingRegs', 'coils'].forEach(
                            (nativeParam: Modbus.RegisterType): void => {
                                native[nativeParam].forEach(item => {
                                    if (native.params.showAliases) {
                                        item._address = address2alias(nativeParam, item._address);
                                        if (native.params.directAddresses) {
                                            item._address = nonDirect2direct(nativeParam, item._address);
                                        }
                                    } else {
                                        if (native.params.directAddresses) {
                                            item._address = direct2nonDirect(nativeParam, item._address);
                                        }
                                        item._address = alias2address(nativeParam, item._address);
                                    }
                                });
                            },
                        );
                    }
                    // detect changes of directAddresses and showAliases
                    if (native.params.directAddresses !== directAddresses) {
                        setDirectAddresses(native.params.directAddresses);
                        if (native.params.showAliases) {
                            ['disInputs', 'coils'].forEach((nativeParam: Modbus.RegisterType): void => {
                                native[nativeParam as 'disInputs' | 'coils'].forEach(item => {
                                    if (native.params.directAddresses) {
                                        item._address = nonDirect2direct(nativeParam, item._address);
                                    } else {
                                        item._address = direct2nonDirect(nativeParam, item._address);
                                    }
                                });
                            });
                        }
                    }
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
