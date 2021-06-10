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
        alignItems: 'center',
        paddingTop: 4,
        paddingBottom: 4
    },
    optionsContainer: {
        width: 'calc(100% - 70px)',
        padding: 10,
        margin: 10,
        display: 'inline-block',
        textAlign: 'left'
    },
    optionsGrid: {
        textAlign: 'center'
    }
});

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
        return <><Paper className={this.props.classes.optionsContainer} elevation={3}>
            <Typography variant="h4" gutterBottom>{I18n.t(title)}</Typography>
            {inputs.map(input => {
            if (input.type === 'checkbox') {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                return <Box className={this.props.classes.optionContainer} key={input.name}><FormControlLabel
                    label={I18n.t(input.title)}
                    control={<Checkbox
                        label={I18n.t(input.title)}
                        className={this.props.classes.optionsCheckbox}
                        disabled={this.inputDisabled(input)}
                        checked={this.props.native.params[input.name]}
                        onChange={e => this.changeParam(input.name, e.target.checked)}
                />}/> {I18n.t(input.dimension)}</Box>
            } else if (input.type === 'select') {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                return <Box className={this.props.classes.optionContainer} key={input.name}>
                    <FormControl>
                        <InputLabel>{I18n.t(input.title)}</InputLabel>
                        <Select
                            className={this.props.classes.optionsSelect}
                            disabled={this.inputDisabled(input)}
                            value={this.props.native.params[input.name]}
                            onChange={e => this.changeParam(input.name, e.target.value)}
                        >
                            {input.options.map(option =>
                                <MenuItem key={option.value} value={option.value}>{option.title}</MenuItem>
                            )}
                        </Select>
                    </FormControl> {I18n.t(input.dimension)}
                </Box>
            } else {
                if (!this.inputDisplay(input)) {
                    return null;
                }
                return <Box className={this.props.classes.optionContainer} key={input.name}><TextField
                    type={input.type}
                    label={I18n.t(input.title)}
                    className={this.props.classes.optionsTextfield}
                    disabled={this.inputDisabled(input)}
                    value={this.props.native.params[input.name]}
                    InputProps={{endAdornment: <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment>}}
                    onChange={e => this.changeParam(input.name, e.target.value)}
                /></Box>
            }
        })}
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

export default withStyles(styles)(Options);
