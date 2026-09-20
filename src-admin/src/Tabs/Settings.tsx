import React from 'react';

import type { AdminConnection, IobTheme, ThemeName, ThemeType } from '@iobroker/gui-components';

import { address2alias, nonDirect2direct, direct2nonDirect, alias2address } from '../Components/Utils';
import { type ConfigItemPanel, JsonConfigComponent } from '@iobroker/json-config';
import ConfigTimingHelp from '../Components/ConfigTimingHelp';
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
        _maxGapInfo: {
            newLine: true,
            type: 'infoBox',
            text: 'maxGapExplanation',
            title: 'Reading registers with gaps',
            hidden: 'data.slave === "1"',
            xs: 12,
        },
        maxGap: {
            newLine: true,
            type: 'number',
            label: 'Max address gap to combine',
            help: 'maxGap_help',
            unit: 'registers',
            min: 0,
            default: 10,
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
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _pollDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'poll',
            xs: 3,
            md: 1,
            hidden: 'data.slave === "1"',
        },
        recon: {
            type: 'number',
            min: 1,
            label: 'Reconnect time',
            unit: 'ms',
            help: 'recon_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _reconDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'recon',
            xs: 3,
            md: 1,
            hidden: 'data.slave === "1"',
        },
        timeout: {
            newLine: true,
            type: 'number',
            min: 100,
            label: 'Read timeout',
            unit: 'ms',
            help: 'timeout_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _timeoutDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'timeout',
            xs: 3,
            md: 1,
            hidden: 'data.slave === "1"',
        },
        pulseTime: {
            type: 'number',
            label: 'Pulse time',
            unit: 'ms',
            help: 'pulsetime_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _pulseTimeDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'pulseTime',
            xs: 3,
            md: 1,
            hidden: 'data.slave === "1"',
        },
        waitTime: {
            newLine: true,
            type: 'number',
            label: 'Wait time',
            unit: 'ms',
            help: 'waitTime_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _waitTimeDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'waitTime',
            xs: 3,
            md: 1,
            hidden: 'data.slave === "1"',
        },
        readInterval: {
            type: 'number',
            label: 'Read interval',
            unit: 'ms',
            help: 'readInterval_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _readIntervalDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'readInterval',
            xs: 3,
            md: 1,
            hidden: 'data.slave === "1"',
        },
        writeInterval: {
            newLine: true,
            type: 'number',
            label: 'Write interval',
            unit: 'ms',
            help: 'writeInterval_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave === "1"',
        },
        _writeIntervalDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'writeInterval',
            xs: 3,
            md: 1,
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

        _headerReadNotify: {
            newLine: true,
            type: 'header',
            label: 'Read notification',
            xs: 12,
            hidden: 'data.slave !== "1"',
        },
        _readNotifyInfo: {
            newLine: true,
            type: 'infoBox',
            text: 'readNotifyExplanation',
            title: 'Read notification',
            xs: 12,
            hidden: 'data.slave !== "1"',
        },
        notifyOnReadExpire: {
            newLine: true,
            type: 'number',
            min: 0,
            label: 'Counter expire time',
            unit: 's',
            help: 'notifyOnReadExpire_help',
            xs: 9,
            md: 5,
            hidden: 'data.slave !== "1"',
        },
        _notifyOnReadExpireDiagram: {
            type: 'component',
            subType: 'timingHelp',
            diagram: 'notifyOnReadExpire',
            xs: 3,
            md: 1,
            hidden: 'data.slave !== "1"',
        },
        notifyOnReadCoils: {
            newLine: true,
            type: 'checkbox',
            label: 'Notify on read: Coils',
            xs: 12,
            md: 6,
            hidden: 'data.slave !== "1"',
        },
        notifyOnReadDisInputs: {
            type: 'checkbox',
            label: 'Notify on read: Discrete inputs',
            xs: 12,
            md: 6,
            hidden: 'data.slave !== "1"',
        },
        notifyOnReadInputRegs: {
            newLine: true,
            type: 'checkbox',
            label: 'Notify on read: Input registers',
            xs: 12,
            md: 6,
            hidden: 'data.slave !== "1"',
        },
        notifyOnReadHoldingRegs: {
            type: 'checkbox',
            label: 'Notify on read: Holding registers',
            xs: 12,
            md: 6,
            hidden: 'data.slave !== "1"',
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
                customComponents={{ timingHelp: ConfigTimingHelp }}
                onChange={(params): void => {
                    const native: Modbus.ModbusAdapterConfig = JSON.parse(JSON.stringify(props.native));
                    native.params = params as Modbus.ModbusParametersTyped;
                    if (native.params.showAliases !== showAliases) {
                        setShowAliases(native.params.showAliases);
                        ['disInputs', 'inputRegs', 'holdingRegs', 'coils'].forEach((nativeParam: string): void => {
                            native[nativeParam as Modbus.RegisterType].forEach(item => {
                                if (native.params.showAliases) {
                                    item._address = address2alias(nativeParam as Modbus.RegisterType, item._address);
                                    if (native.params.directAddresses) {
                                        item._address = nonDirect2direct(
                                            nativeParam as Modbus.RegisterType,
                                            item._address,
                                        );
                                    }
                                } else {
                                    if (native.params.directAddresses) {
                                        item._address = direct2nonDirect(
                                            nativeParam as Modbus.RegisterType,
                                            item._address,
                                        );
                                    }
                                    item._address = alias2address(nativeParam as Modbus.RegisterType, item._address);
                                }
                            });
                        });
                    }
                    // detect changes of directAddresses and showAliases
                    if (native.params.directAddresses !== directAddresses) {
                        setDirectAddresses(native.params.directAddresses);
                        if (native.params.showAliases) {
                            ['disInputs', 'coils'].forEach((nativeParam: string): void => {
                                native[nativeParam as 'disInputs' | 'coils'].forEach(item => {
                                    if (native.params.directAddresses) {
                                        item._address = nonDirect2direct(
                                            nativeParam as Modbus.RegisterType,
                                            item._address,
                                        );
                                    } else {
                                        item._address = direct2nonDirect(
                                            nativeParam as Modbus.RegisterType,
                                            item._address,
                                        );
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
