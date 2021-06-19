import {Component} from 'react';
import PropTypes from 'prop-types';
import {withStyles} from '@material-ui/core/styles';

import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import Checkbox from '@material-ui/core/Checkbox';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import InputAdornment from '@material-ui/core/InputAdornment';
import Grid from '@material-ui/core/Grid';
import Paper from '@material-ui/core/Paper';
import Box from '@material-ui/core/Box';
import FormHelperText from '@material-ui/core/FormHelperText';
import IconButton from '@material-ui/core/IconButton';

import Utils from '../Components/Utils';

import EditIcon from '@material-ui/icons/Edit';

import I18n from '@iobroker/adapter-react/i18n';

import connectionInputs from '../data/optionsConnection';
import generalInputs from '../data/optionsGeneral';

const styles = theme => ({
    optionsSelect: {
        width: 280
    },
    optionsTextfield: {
        width: 280
    },
    optionContainer: {
        display: 'flex',
        alignItems: 'start',
        paddingTop: 4,
        paddingBottom: 4
    },
    helperText: {
        marginTop: -8,
        marginLeft: 32,
        marginBottom: 10
    },
    optionsContainer: {
        width: `calc(100% - ${theme.spacing(4)}px)`,
        padding: theme.spacing(2),
        display: 'inline-block',
        textAlign: 'left'
    },
    optionsGrid: {
        textAlign: 'center',
        padding: theme.spacing(2),
    },
    header: {
        fontSize: 24,
    }
});

class Options extends Component {
    constructor(props) {
        super(props);

        this.state = {
            ports: null,
            customPort: false,
            ips: null,
        };
    }

    readPorts() {
        return this.props.socket.getState(`system.adapter.${this.props.adapterName}.${this.props.instance}.alive`)
            .then(state => {
                if (state && state.val) {
                    return this.props.socket.sendTo(this.props.adapterName + '.' + this.props.instance, 'listUart', null)
                        .then(list => {
                            if (list && list.error) {
                                console.error('Cannot read ports: ' + list.error);
                            } else
                            if (list && list.length === 1 && list[0] && list[0].path === 'Not available') {
                                console.warn('Cannot read ports');
                            } else {
                                const ports = list.map(item => ({value: item.path, title: item.path + (item.manufacturer ? ' [' + item.manufacturer + ']' : '')}));
                                const customPort = this.props.native.params.comName && !ports.find(item => item.value === this.props.native.params.comName);

                                this.setState({ports, customPort});
                            }
                        })
                        .catch(e => console.error('Cannot read ports: ' + e));
                }
            })
            .catch(e => console.error('Cannot read alive: ' + e));
    }

    readIPs() {
        return this.props.socket.getIpAddresses(this.props.common.host)
            .then(ips => {
                ips = ips || [];
                ips = ips.map(ip => ({value: ip, title: ip}));
                ips.unshift({value: '0.0.0.0', title: 'Listen on all IPs'});
                ips.unshift({value: '127.0.0.1', title: '127.0.0.1 (Localhost)'});
                this.setState({ips});
            })
            .catch(e => console.error('Cannot read IP addresses: ' + e));
    }

    componentDidMount() {
        if (this.props.native.params.type === 'serial') {
            this.readPorts();
        }
        if (this.props.native.params.type !== 'serial' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
            this.readIPs();
        }
    }

    inputDisabled = input => {
        if (input.name === 'slave' && this.props.native.params.type !== 'tcp') {
            return true;
        } else
        if (input.name === 'directAddresses' && !this.props.native.params.showAliases) {
            return true;
        } else
        if (input.name === 'multiDeviceId' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
            return true;
        } else
        if (input.name === 'doNotUseWriteMultipleRegisters' && this.props.native.params.onlyUseWriteMultipleRegisters) {
            return true;
        } else
        if (input.name === 'onlyUseWriteMultipleRegisters' && this.props.native.params.doNotUseWriteMultipleRegisters) {
            return true;
        } else {
            return false;
        }
    }

    inputDisplay = input => {
        if (['tcp', 'tcprtu'].includes(this.props.native.params.type)) {
            if (['comName', 'baudRate', 'dataBits', 'stopBits', 'parity'].includes(input.name)) {
                return false;
            }
        } else {
            if (['bind', 'port'].includes(input.name)) {
                return false;
            }
        }
        return true;
    }

    getInputsBlock(inputs, title) {
        return <><Paper className={this.props.classes.optionsContainer}>
            <Typography variant="h4" gutterBottom className={this.props.classes.header}>{I18n.t(title)}</Typography>
            {inputs.map(input => {
                if (!this.inputDisplay(input)) {
                    return null;
                } else if (input.name === 'bind' && this.props.native.params.type !== 'serial' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
                    return <Box className={this.props.classes.optionContainer} key={input.name}>
                        {this.state.ips ?
                            <FormControl>
                                <InputLabel>{I18n.t('Slave IP address')}</InputLabel>
                                <Select
                                    className={this.props.classes.optionsSelect}
                                    disabled={this.inputDisabled(input)}
                                    value={this.props.native.params[input.name] || ''}
                                    onChange={e => this.changeParam(input.name, e.target.value)}
                                >
                                    {this.state.ips.map(option =>
                                        <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>
                                    )}
                                </Select>
                            </FormControl>
                            :
                            <TextField
                                type={input.type}
                                label={I18n.t('Slave IP address')}
                                className={this.props.classes.optionsTextfield}
                                disabled={this.inputDisabled(input)}
                                helperText={input.help ? I18n.t(input.help) : ''}
                                value={this.props.native.params[input.name]}
                                InputProps={{endAdornment: input.dimension ? <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment> : null}}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            />}
                    </Box>;
                }
                if (input.type === 'checkbox') {
                    return <FormControl className={this.props.classes.optionContainer} key={input.name}>
                        <FormControlLabel
                            label={I18n.t(input.title)}
                            control={<Checkbox
                                label={I18n.t(input.title)}
                                className={this.props.classes.optionsCheckbox}
                                disabled={this.inputDisabled(input)}
                                checked={this.props.native.params[input.name]}
                                onChange={e => this.changeParam(input.name, e.target.checked)}
                            />}
                        />
                        {input.help ? <FormHelperText className={this.props.classes.helperText}>{I18n.t(input.help)}</FormHelperText> : null}
                        {input.dimension ? I18n.t(input.dimension) : null}
                    </FormControl>;
                } else if (input.type === 'select') {
                    return <Box className={this.props.classes.optionContainer} key={input.name}>
                        <FormControl>
                            <InputLabel>{I18n.t(input.title)}</InputLabel>
                            <Select
                                className={this.props.classes.optionsSelect}
                                disabled={this.inputDisabled(input)}
                                value={this.props.native.params[input.name] || ''}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            >
                                {input.options.map(option =>
                                    <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>
                                )}
                            </Select>
                        </FormControl> {input.dimension ? I18n.t(input.dimension) : null}
                    </Box>;
                }  else if (input.type === 'ports') {
                    return <Box className={this.props.classes.optionContainer} key={input.name}>
                        {this.state.ports && !this.state.customPort ?
                            <FormControl>
                                <InputLabel>{I18n.t(input.title)}</InputLabel>
                                <Select
                                    className={this.props.classes.optionsSelect}
                                    disabled={this.inputDisabled(input)}
                                    value={this.props.native.params[input.name] || ''}
                                    onChange={e => this.changeParam(input.name, e.target.value)}
                                >
                                    {this.state.ports.map(option =>
                                        <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>
                                    )}
                                </Select>
                            </FormControl>
                            :
                            <TextField
                                type={input.type}
                                label={I18n.t(input.title)}
                                className={this.props.classes.optionsTextfield}
                                disabled={this.inputDisabled(input)}
                                helperText={input.help ? I18n.t(input.help) : ''}
                                value={this.props.native.params[input.name]}
                                InputProps={{endAdornment: input.dimension ? <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment> : null}}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            />}
                            {this.state.ports ? <IconButton onClick={() => this.setState({customPort: !this.state.customPort})}><EditIcon/></IconButton> : null}
                    </Box>;
                } else {
                    return <Box className={this.props.classes.optionContainer} key={input.name}>
                        <TextField
                            type={input.type}
                            label={I18n.t(input.title)}
                            className={this.props.classes.optionsTextfield}
                            disabled={this.inputDisabled(input)}
                            helperText={input.help ? I18n.t(input.help) : ''}
                            value={this.props.native.params[input.name]}
                            InputProps={{endAdornment: input.dimension ? <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment> : null}}
                            onChange={e => this.changeParam(input.name, e.target.value)}
                        />
                    </Box>;
                }
            })
            }
        </Paper></>
    }

    render() {
        return <form className={ this.props.classes.tab }>
            <Grid container spacing={2} >
                <Grid item xs={12} md={6} className={ this.props.classes.optionsGrid }>{this.getInputsBlock(connectionInputs, 'Connection parameters')}</Grid>
                <Grid item xs={12} md={6} className={ this.props.classes.optionsGrid }>{this.getInputsBlock(generalInputs, 'General')}</Grid>
            </Grid>
        </form>;
    }

    changeParam = (name, value) => {
        let native = JSON.parse(JSON.stringify(this.props.native));
        native.params[name] = value;
        if (name === 'slave') {
            if (value === '1' || value === 1) {
                native.params.multiDeviceId = false;
                if (this.props.native.params.type !== 'serial') {
                    this.readIPs();
                }
            }
        } else
        if (name === 'type') {
            if (value !== 'tcp' && (native.params.slave === 1 || native.params.slave === '1')) {
                native.params.slave = '0';
            }

            if (value === 'serial') {
                this.readPorts();
            }
            if (value === 'serial' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
                this.readIPs();
            }
        } else
        if (name === 'showAliases') {
            ['disInputs', 'inputRegs', 'holdingRegs'].forEach(nativeParam => {
                native[nativeParam].forEach(item => {
                    if (value) {
                        item._address = Utils.address2alias(nativeParam, item._address);
                        if (native.params.directAddresses) {
                            item._address = Utils.nonDirect2direct(nativeParam, item._address);
                        }
                    } else {
                        if (native.params.directAddresses) {
                            item._address = Utils.direct2nonDirect(nativeParam, item._address);
                        }
                        item._address = Utils.alias2address(nativeParam, item._address);
                    }
                });
            });
        }
        if (name === 'directAddresses' && native.params.showAliases) {
            ['disInputs', 'inputRegs', 'holdingRegs'].forEach(nativeParam => {
                native[nativeParam].forEach(item => {
                    if (value) {
                        item._address = Utils.nonDirect2direct(nativeParam, item._address);
                    } else {
                        item._address = Utils.direct2nonDirect(nativeParam, item._address);
                    }
                });
            });
        }
        this.props.changeNative(native);
    }
}

Options.propTypes = {
    common: PropTypes.object.isRequired,
    native: PropTypes.object.isRequired,
    instance: PropTypes.number.isRequired,
    adapterName: PropTypes.string.isRequired,
    onError: PropTypes.func,
    onLoad: PropTypes.func,
    onChange: PropTypes.func,
    changed: PropTypes.bool,
    socket: PropTypes.object.isRequired,
    rooms: PropTypes.object,
};

export default withStyles(styles)(Options);
