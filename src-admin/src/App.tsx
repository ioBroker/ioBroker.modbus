import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import { AppBar, Tabs, Tab } from '@mui/material';

import { AiOutlineFieldBinary as BinaryIcon } from 'react-icons/ai';
import { TiSortNumerically as DigitsIcon } from 'react-icons/ti';

import {
    Loader,
    I18n,
    GenericApp,
    type IobTheme,
    type GenericAppProps,
    type GenericAppState,
    AdminConnection,
} from '@iobroker/adapter-react-v5';

import TabSettings from './Tabs/Settings';
import TabInputRegisters from './Tabs/InputRegisters';
import TabHoldingRegisters from './Tabs/HoldingRegisters';
import TabDiscreteInputs from './Tabs/DiscreteInputs';
import TabCoils from './Tabs/Coils';
import TabConnection from './Tabs/Connection';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import ukLang from './i18n/uk.json';
import zhCnLang from './i18n/zh-cn.json';
import type { Modbus } from '@iobroker/modbus';

const styles: Record<string, any> = {
    tabContent: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px)',
        overflow: 'auto',
    },
    tabContentIFrame: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px - 38px)',
        overflow: 'auto',
    },
    selected: (theme: IobTheme): React.CSSProperties => ({
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    }),
    indicator: (theme: IobTheme): React.CSSProperties => ({
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    }),
};

const tabs: {
    name: string;
    title: string;
    icon?: React.JSX.Element;
    tooltip?: string;
}[] = [
    {
        name: 'connection',
        title: 'Connection',
    },
    {
        name: 'settings',
        title: 'Settings',
    },
    {
        name: 'discrete-inputs',
        title: 'Discrete inputs',
        icon: <BinaryIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Binary inputs (read-only)',
    },
    {
        name: 'coils',
        title: 'Coils',
        icon: <BinaryIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Binary inputs and outputs',
    },
    {
        name: 'input-registers',
        title: 'Input Registers',
        icon: <DigitsIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Input registers (8-64 bit values, read-only)',
    },
    {
        name: 'holding-registers',
        title: 'Holding Registers',
        icon: <DigitsIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Input/output registers (8-64 bit values)',
    },
];

function sort(data: Modbus.Register[]): void {
    data.sort((item1, item2) => {
        item1.deviceId = parseInt(item1.deviceId as string, 10) || 1;
        item2.deviceId = parseInt(item2.deviceId as string, 10) || 1;
        item1._address = parseInt(item1._address as string, 10) || 0;
        item2._address = parseInt(item2._address as string, 10) || 0;
        const sort1 = (item1.deviceId << 16) | item1._address;
        const sort2 = (item2.deviceId << 16) | item2._address;
        return sort1 < sort2 ? -1 : sort1 > sort2 ? 1 : 0;
    });
}

interface AppState extends GenericAppState {
    moreLoaded: boolean;
    rooms: Record<string, ioBroker.EnumObject> | null;
    alive: boolean;
    systemConfig: ioBroker.SystemConfigObject | null;
}

class App extends GenericApp<GenericAppProps, AppState> {
    constructor(props: GenericAppProps) {
        const extendedProps = { ...props };
        extendedProps.encryptedFields = ['pass'];

        extendedProps.translations = {
            en: enLang,
            de: deLang,
            ru: ruLang,
            pt: ptLang,
            nl: nlLang,
            fr: frLang,
            it: itLang,
            es: esLang,
            pl: plLang,
            uk: ukLang,
            'zh-cn': zhCnLang,
        };

        // @ts-expect-error tbd
        extendedProps.Connection = AdminConnection;

        extendedProps.sentryDSN = window.sentryDSN;

        super(props, extendedProps);
        this.state = {
            ...this.state,
            moreLoaded: false,
            rooms: null,
            alive: false,
            systemConfig: null,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    onPrepareSave(native: Modbus.ModbusAdapterConfig): boolean {
        // sort all arrays by device:address
        native.disInputs && sort(native.disInputs);
        native.coils && sort(native.coils);
        native.inputRegs && sort(native.inputRegs);
        native.holdingRegs && sort(native.holdingRegs);

        return true;
    }

    async onConnectionReady(): Promise<void> {
        super.onConnectionReady();
        const selectedTab = window.localStorage.getItem(`modbus.${this.instance}.selectedTab`) || 'connection';

        void this.socket.getEnums('rooms').then(rooms => this.setState({ moreLoaded: true, rooms }));

        const systemConfig = await this.socket.getSystemConfig();
        const aliveState = await this.socket.getState(`system.adapter.modbus.${this.instance}.alive`);
        this.setState({ alive: !!aliveState?.val, selectedTab, systemConfig });
        await this.socket.subscribeState(`system.adapter.modbus.${this.instance}.alive`, this.onAliveChanged);
    }

    onAliveChanged = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (!!state?.val !== this.state.alive) {
            this.setState({ alive: !!state?.val });
        }
    };

    renderConnection(): React.JSX.Element {
        if (!this.state.systemConfig) {
            return <div>{I18n.t('Loading...')}</div>;
        }
        return (
            <TabConnection
                common={this.common || ({} as ioBroker.InstanceCommon)}
                socket={this.socket}
                native={this.state.native as Modbus.ModbusAdapterConfig}
                instance={this.instance}
                adapterName={this.adapterName}
                changeNative={(native: Modbus.ModbusAdapterConfig): void =>
                    this.setState({ native, changed: this.getIsChanged(native) })
                }
                themeType={this.state.themeType}
                theme={this.state.theme}
                themeName={this.state.themeName}
                systemConfig={this.state.systemConfig}
            />
        );
    }

    renderSettings(): React.JSX.Element {
        if (!this.state.systemConfig) {
            return <div>{I18n.t('Loading...')}</div>;
        }
        return (
            <TabSettings
                common={this.common || ({} as ioBroker.InstanceCommon)}
                socket={this.socket}
                native={this.state.native as Modbus.ModbusAdapterConfig}
                instance={this.instance}
                adapterName={this.adapterName}
                changeNative={(native: Modbus.ModbusAdapterConfig): void =>
                    this.setState({ native, changed: this.getIsChanged(native) })
                }
                themeType={this.state.themeType}
                theme={this.state.theme}
                themeName={this.state.themeName}
                systemConfig={this.state.systemConfig}
            />
        );
    }

    renderDiscreteInputs(): React.JSX.Element {
        return (
            <TabDiscreteInputs
                alive={this.state.alive}
                formulaDisabled={this.state.native.params.slave === '1' || this.state.native.params.slave === 1}
                socket={this.socket}
                native={this.state.native as Modbus.ModbusAdapterConfig}
                instance={this.instance}
                adapterName={this.adapterName}
                changed={this.state.changed}
                onChange={(attr: keyof Modbus.ModbusAdapterConfig, value: any, cb?: () => void): void =>
                    this.updateNativeValue(attr, value, cb)
                }
                rooms={this.state.rooms || {}}
                themeType={this.state.themeType}
            />
        );
    }

    renderCoils(): React.JSX.Element {
        return (
            <TabCoils
                alive={this.state.alive}
                formulaDisabled={this.state.native.params.slave === '1' || this.state.native.params.slave === 1}
                socket={this.socket}
                native={this.state.native as Modbus.ModbusAdapterConfig}
                instance={this.instance}
                adapterName={this.adapterName}
                changed={this.state.changed}
                onChange={(attr: keyof Modbus.ModbusAdapterConfig, value: any, cb?: () => void): void =>
                    this.updateNativeValue(attr, value, cb)
                }
                rooms={this.state.rooms || {}}
                themeType={this.state.themeType}
            />
        );
    }

    renderInputRegisters(): React.JSX.Element {
        return (
            <TabInputRegisters
                alive={this.state.alive}
                formulaDisabled={this.state.native.params.slave === '1' || this.state.native.params.slave === 1}
                socket={this.socket}
                native={this.state.native as Modbus.ModbusAdapterConfig}
                instance={this.instance}
                adapterName={this.adapterName}
                changed={this.state.changed}
                onChange={(attr: keyof Modbus.ModbusAdapterConfig, value: any, cb?: () => void): void =>
                    this.updateNativeValue(attr, value, cb)
                }
                rooms={this.state.rooms || {}}
                themeType={this.state.themeType}
            />
        );
    }

    renderHoldingRegisters(): React.JSX.Element {
        return (
            <TabHoldingRegisters
                alive={this.state.alive}
                formulaDisabled={this.state.native.params.slave === '1' || this.state.native.params.slave === 1}
                socket={this.socket}
                native={this.state.native as Modbus.ModbusAdapterConfig}
                instance={this.instance}
                adapterName={this.adapterName}
                changed={this.state.changed}
                onChange={(attr: keyof Modbus.ModbusAdapterConfig, value: any, cb?: () => void): void =>
                    this.updateNativeValue(attr, value, cb)
                }
                rooms={this.state.rooms || {}}
                themeType={this.state.themeType}
            />
        );
    }

    renderTab(): React.JSX.Element {
        if (this.state.selectedTab === 'connection' || !this.state.selectedTab) {
            return this.renderConnection();
        }
        if (this.state.selectedTab === 'settings') {
            return this.renderSettings();
        }
        if (this.state.selectedTab === 'discrete-inputs') {
            return this.renderDiscreteInputs();
        }
        if (this.state.selectedTab === 'coils') {
            return this.renderCoils();
        }
        if (this.state.selectedTab === 'input-registers') {
            return this.renderInputRegisters();
        }
        if (this.state.selectedTab === 'holding-registers') {
            return this.renderHoldingRegisters();
        }
        return <div>{I18n.t('Unknown tab')}</div>;
    }

    render(): React.JSX.Element {
        if (!this.state.loaded || !this.state.moreLoaded) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <div
                        className="App"
                        style={{
                            background: this.state.theme.palette.background.default,
                            color: this.state.theme.palette.text.primary,
                        }}
                    >
                        <AppBar position="static">
                            <Tabs
                                indicatorColor="secondary"
                                value={this.state.selectedTab || tabs[0].name}
                                onChange={(_e, value) => {
                                    this.setState({ selectedTab: value });
                                    window.localStorage.setItem(`modbus.${this.instance}.selectedTab`, value);
                                }}
                                variant="scrollable"
                                scrollButtons="auto"
                                sx={{ '&.Mui-indicator': styles.indicator }}
                            >
                                {tabs.map(tab => (
                                    <Tab
                                        value={tab.name}
                                        sx={{ '&.Mui-selected': styles.selected }}
                                        label={
                                            tab.icon ? (
                                                <>
                                                    {tab.icon}
                                                    {I18n.t(tab.title)}
                                                </>
                                            ) : (
                                                I18n.t(tab.title)
                                            )
                                        }
                                        data-name={tab.name}
                                        key={tab.name}
                                        title={tab.tooltip ? I18n.t(tab.tooltip) : undefined}
                                    />
                                ))}
                            </Tabs>
                        </AppBar>
                        <div style={this.isIFrame ? styles.tabContentIFrame : styles.tabContent}>
                            {this.renderTab()}
                        </div>
                        {this.renderError()}
                        {this.renderSaveCloseButtons()}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}

export default App;
