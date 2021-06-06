import React, {Component} from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

import TextField from '@material-ui/core/TextField';
import Checkbox from '@material-ui/core/Checkbox';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';

import I18n from '@iobroker/adapter-react/i18n';

const connectionInputs = [
    {
        name: 'type', type: 'select', title: 'TCP/Serial RTU',
        options: [
            {
                value: 'tcp', title: 'TCP'
            },
            {
                value: 'serial', title: 'Serial'
            },
            {
                value: 'tcprtu', title: 'RTU over TCP'
            },
        ]
    },
    {
        name: 'comName', type: 'select', title: 'Port',
        options: [
            {value: '', title: 'Select port'},
            {value: 'COM1', title: 'COM1'},
        ]
    },
    {
        name: 'baudRate', type: 'select', title: 'Baud rate',
        options: [
            {value: '110', title: '110'},
            {value: '150', title: '150'},
            {value: '300', title: '300'},
            {value: '600', title: '600'},
            {value: '1200', title: '1200'},
            {value: '2400', title: '2400'},
            {value: '4800', title: '4800'},
            {value: '9600', title: '9600'},
            {value: '19200', title: '19200'},
            {value: '38400', title: '38400'},
            {value: '56000', title: '56000'},
            {value: '57600', title: '57600'},
            {value: '115200', title: '115200'},
        ]
    },
    {
        name: 'dataBits', type: 'select', title: 'Data bits',
        options: [
            {value: '8', title: '8'},
            {value: '7', title: '7'},
            {value: '6', title: '6'},
            {value: '5', title: '5'},
        ]
    },
    {
        name: 'stopBits', type: 'select', title: 'Stop bits',
        options: [
            {value: '1', title: '1'},
            {value: '2', title: '2'},
        ]
    },
    {
        name: 'parity', type: 'select', title: 'Parity',
        options: [
            {value: 'none', title: 'none'},
            {value: 'even', title: 'even'},
            {value: 'mark', title: 'mark'},
            {value: 'odd', title: 'odd'},
            {value: 'space', title: 'space'},
        ]
    },
    {
        name: 'bind', type: 'text', title: 'Patner IP address'
    },
    {
        name: 'port', type: 'number', title: 'Port'
    },
    {
        name: 'deviceId', type: 'text', title: 'Device ID'
    },
    {
        name: 'multiDeviceId', type: 'checkbox', title: 'Multi device ID'
    },
    {
        name: 'slave', type: 'select', title: 'Type',
        options: [
            {
                value: '0',
                title: 'Master'
            },
            {
                value: '1',
                title: 'Slave'
            }
        ]
    },
]

const generalInputs = [
    {
        name: 'showAliases', type: 'checkbox',title: 'Use aliases'
    },
    {
        name: 'directAddresses', type: 'checkbox', title: 'Use direct addresses by aliases'
    },
    {
        name: 'doNotRoundAddressToWord', type: 'checkbox', title: 'Do not align addresses to 16 bits'
    },
    {
        name: 'doNotUseWriteMultipleRegisters', type: 'checkbox', title: 'Do not use Write multiple registers'
    },
    {
        name: 'round', type: 'number', title: 'Round Real to'
    },
    {
        name: 'poll', type: 'number', title: 'Poll delay', dimension: 'ms'
    },
    {
        name: 'recon', type: 'number', title: 'Reconnect time', dimension: 'ms'
    },
    {
        name: 'timeout', type: 'number', title: 'Read timeout', dimension: 'ms'
    },
    {
        name: 'pulsetime', type: 'number', title: 'Pulse time', dimension: 'ms'
    },
    {
        name: 'waitTime', type: 'number', title: 'Wait time', dimension: 'ms'
    },
    {
        name: 'maxBlock', type: 'number', title: 'Max read request length (float)', dimension: 'registers'
    },
    {
        name: 'maxBoolBlock', type: 'number', title: 'Max read request length (booleans)', dimension: 'registers'
    },
    {
        name: 'writeInterval', type: 'number', title: 'Write interval', dimension: 'ms'
    },
    {
        name: 'alwaysUpdate', type: 'checkbox', title: 'Update unchanged states'
    },
    {
        name: 'doNotIncludeAdrInId', type: 'checkbox', title: 'do not include address in ID'
    },
    {
        name: 'preserveDotsInId', type: 'checkbox', title: 'preserve dots in ID'
    },
]

class Options extends Component {
    constructor(props) {
        super(props);

        this.state = {
        };
    }

    inputDisabled = input => {
        if (input.name === 'slave' && this.props.native.params.type !== 'tcp') {
            return true;
        }
        if (input.name === 'directAddresses' && !this.props.native.params.showAliases) {
            return true;
        }
        return false;
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
        return <><h2>{I18n.t(title)}</h2>
            {inputs.map(input => {
            if (input.type === 'checkbox') {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                return <div><FormControlLabel
                    label={I18n.t(input.title)}
                    control={<Checkbox
                        label={I18n.t(input.title)} 
                        disabled={this.inputDisabled(input)}
                        checked={this.props.native.params[input.name]} 
                        onChange={e => this.changeParam(input.name, e.target.checked)}
                />}/> {I18n.t(input.dimension)}</div>
            } else if (input.type === 'select') {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                return <div>
                    <FormControl>
                        <InputLabel>{I18n.t(input.title)}</InputLabel>
                        <Select
                            style={{width: 200}}
                            disabled={this.inputDisabled(input)}
                            value={this.props.native.params[input.name]} 
                            onChange={e => this.changeParam(input.name, e.target.value)}
                        >
                            {input.options.map(option => 
                                <MenuItem key={option.value} value={option.value}>{I18n.t(option.title)}</MenuItem>
                            )}
                        </Select>
                    </FormControl> {I18n.t(input.dimension)}
                </div>
            } else {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                return <div><TextField 
                    type={input.type} 
                    label={I18n.t(input.title)} 
                    disabled={this.inputDisabled(input)}
                    value={this.props.native.params[input.name]} 
                    onChange={e => this.changeParam(input.name, e.target.value)}
                /> {I18n.t(input.dimension)}</div>
            }
        })}
        </>
    }

    render() {
        return <form className={ this.props.classes.tab }>
            <div className={clsx(this.props.classes.column, this.props.classes.columnSettings) }>
                {this.getInputsBlock(connectionInputs, 'Connection parameters')}
                {this.getInputsBlock(generalInputs, 'General')}
            </div>
        </form>;
    }

    changeParam = (name, value) => {
        let native = JSON.parse(JSON.stringify(this.props.native));
        native.params[name] = value;
        if (name === 'showAliases') {
            native.disInputs.forEach(item => (value ? item._address += 10000 : item._address -= 10000))
            native.inputRegs.forEach(item => (value ? item._address += 30000 : item._address -= 30000))
            native.holdingRegs.forEach(item => (value ? item._address += 40000 : item._address -= 40000))
            if (!value) {
                native.params.directAddresses = false;
            }
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
};

export default Options;
