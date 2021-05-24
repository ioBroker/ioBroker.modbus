import React from 'react';
import {withStyles} from '@material-ui/core/styles';
import { MuiThemeProvider } from '@material-ui/core/styles';

import AppBar from '@material-ui/core/AppBar';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import GenericApp from '@iobroker/adapter-react/GenericApp';
import Loader from '@iobroker/adapter-react/Components/Loader'

import I18n from '@iobroker/adapter-react/i18n';
import TabOptions from './Tabs/Options';
import TabInputRegisters from './Tabs/InputRegisters';
import TabHoldingRegisters from './Tabs/HoldingRegisters';
import TabDiscreteInputs from './Tabs/DiscreteInputs';
import TabCoils from './Tabs/Coils';

const styles = theme => ({
    root: {},
    tabContent: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px)',
        overflow: 'auto'
    },
    tabContentIFrame: {
        padding: 10,
        height: 'calc(100% - 64px - 48px - 20px - 38px)',
        overflow: 'auto'
    },
    tab: {
        width: '100%',
        minHeight: '100%'
    },
    column: {
        display: 'inline-block',
        verticalAlign: 'top',
        marginRight: 20
    },
    columnSettings: {
        width: 'calc(100% - 370px)',
    },
});

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
    },
    {
        name: 'coils',
        title: 'Coils',
        component: TabCoils,
    },
    {
        name: 'input-registers',
        title: 'Input Registers',
        component: TabInputRegisters,
    },
    {
        name: 'holding-registers',
        title: 'Holding Registers',
        component: TabHoldingRegisters,
    },
]

class App extends GenericApp {
    constructor(props) {
        const extendedProps = {...props};
        extendedProps.encryptedFields = ['pass'];
        extendedProps.translations = {
            'en': require('./i18n/en'),
            'de': require('./i18n/de'),
            'ru': require('./i18n/ru'),
            'pt': require('./i18n/pt'),
            'nl': require('./i18n/nl'),
            'fr': require('./i18n/fr'),
            'it': require('./i18n/it'),
            'es': require('./i18n/es'),
            'pl': require('./i18n/pl'),
            'zh-cn': require('./i18n/zh-cn'),
        };

        super(props, extendedProps);
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
        if (!this.state.loaded) {
            return <MuiThemeProvider theme={this.state.theme}>
                <Loader theme={this.state.themeType} />
            </MuiThemeProvider>;
        }

        console.log(this.state);

        return <MuiThemeProvider theme={this.state.theme}>
            <div className="App" style={{background: this.state.theme.palette.background.default, color: this.state.theme.palette.text.primary}}>
                <AppBar position="static">
                    <Tabs value={this.getSelectedTab()} onChange={(e, index) => this.selectTab(tabs[index].name, index)} scrollButtons="auto">
                        {tabs.map(tab => 
                            <Tab label={I18n.t(tab.title)} data-name={tab.name} key={tab.name} />
                        )}
                    </Tabs>
                </AppBar>

                <div className={this.isIFrame ? this.props.classes.tabContentIFrame : this.props.classes.tabContent}>
                    {tabs.map((tab, index) => {
                        const TabComponent = tab.component;
                        if (this.state.selectedTab) {
                            if (this.state.selectedTab !== tab.name) {
                                return null;
                            }
                        } else {
                            if (index !== 0) {
                                return null;
                            }
                        }
                        return <TabComponent
                            key={tab.name}
                            common={this.common}
                            socket={this.socket}
                            native={this.state.native}
                            onError={text => this.setState({errorText: (text || text === 0) && typeof text !== 'string' ? text.toString() : text})}
                            onLoad={native => this.onLoadConfig(native)}
                            instance={this.instance}
                            adapterName={this.adapterName}
                            changed={this.state.changed}
                            classes={this.props.classes}
                            onChange={(attr, value, cb) => this.updateNativeValue(attr, value, cb)}
                        />
                    })}
                </div>
                {this.renderError()}
                {this.renderSaveCloseButtons()}
            </div>
        </MuiThemeProvider>;
    }
}

export default withStyles(styles)(App);
