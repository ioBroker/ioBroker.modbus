import React from 'react';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { SnackbarProvider } from 'notistack';

import { AppBar, Tabs, Tab } from '@mui/material';

import { AiOutlineFieldBinary as BinaryIcon } from 'react-icons/ai';
import { TiSortNumerically as DigitsIcon } from 'react-icons/ti';

import { Loader, I18n, GenericApp } from '@iobroker/adapter-react-v5';

import TabOptions from './Tabs/Options';
import TabInputRegisters from './Tabs/InputRegisters';
import TabHoldingRegisters from './Tabs/HoldingRegisters';
import TabDiscreteInputs from './Tabs/DiscreteInputs';
import TabCoils from './Tabs/Coils';

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

const styles = {
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
    selected: theme => ({
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    }),
    indicator: theme => ({
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    }),
};

const tabs = [
    {
        name: 'general',
        title: 'General',
        component: TabOptions,
    },
    {
        name: 'discrete-inputs',
        title: 'Discrete inputs',
        component: TabDiscreteInputs,
        icon: <BinaryIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Binary inputs (read-only)',
    },
    {
        name: 'coils',
        title: 'Coils',
        component: TabCoils,
        icon: <BinaryIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Binary inputs and outputs',
    },
    {
        name: 'input-registers',
        title: 'Input Registers',
        component: TabInputRegisters,
        icon: <DigitsIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Input registers (8-64 bit values, read-only)',
    },
    {
        name: 'holding-registers',
        title: 'Holding Registers',
        component: TabHoldingRegisters,
        icon: <DigitsIcon style={{ width: 18, height: 18, marginRight: 4, display: 'inline-block' }} />,
        tooltip: 'Input/output registers (8-64 bit values)',
    },
];

function sort(data) {
    data.sort((item1, item2) => {
        item1.deviceId = parseInt(item1.deviceId, 10) || 1;
        item2.deviceId = parseInt(item2.deviceId, 10) || 1;
        item1._address = parseInt(item1._address, 10) || 0;
        item2._address = parseInt(item2._address, 10) || 0;
        const sort1 = (parseInt(item1.deviceId, 10) << 16) | parseInt(item1._address, 10);
        const sort2 = (parseInt(item2.deviceId, 10) << 16) | parseInt(item2._address, 10);
        return sort1 < sort2 ? -1 : sort1 > sort2 ? 1 : 0;
    });
}

class App extends GenericApp {
    constructor(props) {
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

        extendedProps.sentryDSN = window.sentryDSN;

        super(props, extendedProps);
        this.state.moreLoaded = false;
        this.state.rooms = null;
    }

    onPrepareSave(native) {
        // sort all arrays by device:address
        native.disInputs && sort(native.disInputs);
        native.coils && sort(native.coils);
        native.inputRegs && sort(native.inputRegs);
        native.holdingRegs && sort(native.holdingRegs);

        return native;
    }

    onConnectionReady() {
        super.onConnectionReady();

        this.socket.getEnums('rooms').then(rooms => this.setState({ moreLoaded: true, rooms }));
    }

    getSelectedTab() {
        const selectedTab = this.state.selectedTab;
        if (!selectedTab) {
            return 0;
        } else {
            return tabs.findIndex(tab => tab.name === selectedTab);
        }
    }

    render() {
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
                    <SnackbarProvider>
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
                                    onChange={(e, value) => this.setState({ selectedTab: value })}
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
                                {tabs.map((tab, index) => {
                                    const TabComponent = tab.component;
                                    if (this.state.selectedTab) {
                                        if (this.state.selectedTab !== tab.name) {
                                            return null;
                                        }
                                    } else if (index !== 0) {
                                        return null;
                                    }

                                    return (
                                        <TabComponent
                                            key={tab.name}
                                            formulaDisabled={
                                                this.state.native.params.slave === '1' ||
                                                this.state.native.params.slave === 1
                                            }
                                            common={this.common}
                                            socket={this.socket}
                                            native={this.state.native}
                                            onError={text =>
                                                this.setState({
                                                    errorText:
                                                        (text || text === 0) && typeof text !== 'string'
                                                            ? text.toString()
                                                            : text,
                                                })
                                            }
                                            onLoad={native => this.onLoadConfig(native)}
                                            instance={this.instance}
                                            adapterName={this.adapterName}
                                            changed={this.state.changed}
                                            onChange={(attr, value, cb) => this.updateNativeValue(attr, value, cb)}
                                            changeNative={value =>
                                                this.setState({ native: value, changed: this.getIsChanged(value) })
                                            }
                                            rooms={this.state.rooms}
                                        />
                                    );
                                })}
                            </div>
                            {this.renderError()}
                            {this.renderSaveCloseButtons()}
                        </div>
                    </SnackbarProvider>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}

export default App;
