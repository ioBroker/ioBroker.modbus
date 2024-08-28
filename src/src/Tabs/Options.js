import { Component } from 'react';
import PropTypes from 'prop-types';

import {
    Typography,
    TextField,
    Checkbox,
    Select,
    MenuItem,
    FormControlLabel,
    FormControl,
    InputLabel,
    InputAdornment,
    Grid,
    Paper,
    Box,
    FormHelperText,
    IconButton,
    Tooltip,
} from '@mui/material';

import { Edit as EditIcon, Info as IconInfo } from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';

import Utils from '../Components/Utils';
import connectionInputs from '../data/optionsConnection';
import generalInputs from '../data/optionsGeneral';

const styles = {
    optionsSelect: {
        width: 280,
    },
    optionsTextField: {
        width: 280,
    },
    optionContainer: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingTop: 4,
        paddingBottom: 4,
    },
    helperText: {
        marginTop: -8,
        marginLeft: 32,
        marginBottom: 10,
    },
    optionsContainer: {
        width: `calc(100% - 32px)`,
        padding: 16,
        display: 'inline-block',
        textAlign: 'left',
    },
    optionsGrid: {
        textAlign: 'center',
        padding: 16,
    },
    header: {
        fontSize: 24,
    },
};

function text2react(text) {
    if (!text.includes('\n')) {
        return text;
    }
    const lines = text.split('\n');
    return lines.map((line, i) => <p key={i}>{line}</p>);
}

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
                    return this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'listUart', null)
                        .then(list => {
                            if (list && list.error) {
                                console.error(`Cannot read ports: ${list.error}`);
                            } else
                            if (list && list.length === 1 && list[0] && list[0].path === 'Not available') {
                                console.warn('Cannot read ports');
                            } else {
                                const ports = list.map(item => ({value: item.path, title: item.path + (item.manufacturer ? ` [${item.manufacturer}]` : '')}));
                                const customPort = this.props.native.params.comName && !ports.find(item => item.value === this.props.native.params.comName);

                                this.setState({ports, customPort});
                            }
                        })
                        .catch(e => console.error(`Cannot read ports: ${e}`));
                }
            })
            .catch(e => console.error(`Cannot read alive: ${e}`));
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
            .catch(e => console.error(`Cannot read IP addresses: ${e}`));
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
        } else if (input.name === 'directAddresses' && !this.props.native.params.showAliases) {
            return true;
        } else if (input.name === 'multiDeviceId' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
            return true;
        } else if (input.name === 'doNotUseWriteMultipleRegisters' && this.props.native.params.onlyUseWriteMultipleRegisters) {
            return true;
        } else if (input.name === 'onlyUseWriteMultipleRegisters' && this.props.native.params.doNotUseWriteMultipleRegisters) {
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
        } else if (['bind', 'port'].includes(input.name)) {
            return false;
        }

        return true;
    }

    getInputsBlock(inputs, title) {
        return <Paper style={styles.optionsContainer}>
            <Typography variant="h4" gutterBottom style={styles.header}>{I18n.t(title)}</Typography>
            {inputs.map(input => {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                if (input.name === 'bind' && this.props.native.params.type !== 'serial' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
                    return <Box style={styles.optionContainer} key={input.name}>
                        {this.state.ips ?
                            <FormControl>
                                <InputLabel>{I18n.t('Slave IP address')}</InputLabel>
                                <Select
                                    variant="standard"
                                    style={styles.optionsSelect}
                                    disabled={this.inputDisabled(input)}
                                    value={this.props.native.params[input.name] || ''}
                                    onChange={e => this.changeParam(input.name, e.target.value)}
                                >
                                    {this.state.ips.map(option =>
                                        <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>)}
                                </Select>
                            </FormControl>
                            :
                            <TextField
                                variant="standard"
                                type={input.type}
                                label={I18n.t('Slave IP address')}
                                style={styles.optionsTextField}
                                disabled={this.inputDisabled(input)}
                                helperText={input.help ? I18n.t(input.help) : ''}
                                value={this.props.native.params[input.name]}
                                InputProps={{endAdornment: input.dimension ? <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment> : null}}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            />}
                    </Box>;
                }
                if (input.type === 'checkbox') {
                    return <FormControl style={styles.optionContainer} key={input.name}>
                        <div>
                            <FormControlLabel
                                label={I18n.t(input.title)}
                                control={<Checkbox
                                    label={I18n.t(input.title)}
                                    style={styles.optionsCheckbox}
                                    disabled={this.inputDisabled(input)}
                                    checked={this.props.native.params[input.name]}
                                    onChange={e => this.changeParam(input.name, e.target.checked)}
                                />}
                            />
                            {input.help ? <FormHelperText style={styles.helperText}>{I18n.t(input.help)}</FormHelperText> : null}
                        </div>
                        {input.tooltip ? <Tooltip title={text2react(I18n.t(input.tooltip))}>
                            <IconInfo />
                        </Tooltip> : null}
                    </FormControl>;
                }
                if (input.type === 'select') {
                    return <Box style={styles.optionContainer} key={input.name}>
                        <FormControl style={{ marginRight: 8 }}>
                            <InputLabel>{I18n.t(input.title)}</InputLabel>
                            <Select
                                variant="standard"
                                style={styles.optionsSelect}
                                disabled={this.inputDisabled(input)}
                                value={this.props.native.params[input.name] || ''}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            >
                                {input.options.map(option =>
                                    <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>)}
                            </Select>
                        </FormControl>
                        {input.dimension ? I18n.t(input.dimension) : null}
                        {input.tooltip ? <Tooltip title={text2react(I18n.t(input.tooltip))}>
                            <IconInfo />
                        </Tooltip> : null}
                    </Box>;
                }
                if (input.type === 'ports') {
                    return <Box style={styles.optionContainer} key={input.name}>
                        {this.state.ports && !this.state.customPort ?
                            <FormControl>
                                <InputLabel>{I18n.t(input.title)}</InputLabel>
                                <Select
                                    variant="standard"
                                    style={styles.optionsSelect}
                                    disabled={this.inputDisabled(input)}
                                    value={this.props.native.params[input.name] || ''}
                                    onChange={e => this.changeParam(input.name, e.target.value)}
                                >
                                    {this.state.ports.map(option =>
                                        <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>)}
                                </Select>
                            </FormControl>
                            :
                            <TextField
                                variant="standard"
                                type={input.type}
                                label={I18n.t(input.title)}
                                style={styles.optionsTextField}
                                disabled={this.inputDisabled(input)}
                                helperText={input.help ? I18n.t(input.help) : ''}
                                value={this.props.native.params[input.name]}
                                InputProps={{endAdornment: input.dimension ? <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment> : null}}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            />}
                            {this.state.ports ? <IconButton onClick={() => this.setState({ customPort: !this.state.customPort })}>
                                <EditIcon/>
                            </IconButton> : null}
                    </Box>;
                }

                const inputProps = {};
                if (input.min !== undefined) {
                    inputProps.min = input.min;
                }
                if (input.max !== undefined) {
                    inputProps.max = input.max;
                }

                return <Box style={styles.optionContainer} key={input.name}>
                    <TextField
                        variant="standard"
                        type={input.type}
                        label={I18n.t(input.title)}
                        style={styles.optionsTextField}
                        inputProps={inputProps}
                        disabled={this.inputDisabled(input)}
                        helperText={input.help ? I18n.t(input.help) : ''}
                        value={this.props.native.params[input.name]}
                        InputProps={{endAdornment: input.dimension ? <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment> : null}}
                        onChange={e => this.changeParam(input.name, e.target.value)}
                    />
                    {input.tooltip ? <Tooltip title={text2react(I18n.t(input.tooltip))}>
                        <IconInfo />
                    </Tooltip> : null}
                </Box>;
            })}
        </Paper>;
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
        } else if (name === 'type') {
            if (value !== 'tcp' && (native.params.slave === 1 || native.params.slave === '1')) {
                native.params.slave = '0';
            }

            if (value === 'serial') {
                this.readPorts();
            }
            if (value === 'serial' && (this.props.native.params.slave === '1' || this.props.native.params.slave === 1)) {
                this.readIPs();
            }
        } else if (name === 'showAliases') {
            ['disInputs', 'inputRegs', 'holdingRegs', 'coils'].forEach(nativeParam => {
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
        } else if (name === 'directAddresses' && native.params.showAliases) {
            ['disInputs', 'coils'].forEach(nativeParam => {
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

    render() {
        return <form style={{ width: '100%', minHeight: '100%' }}>
            <Grid container spacing={2} >
                <Grid item xs={12} md={6} style={styles.optionsGrid}>{this.getInputsBlock(connectionInputs, 'Connection parameters')}</Grid>
                <Grid item xs={12} md={6} style={styles.optionsGrid}>{this.getInputsBlock(generalInputs, 'General')}</Grid>
            </Grid>
        </form>;
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

export default Options;
