import React, { Component } from 'react';

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
    Paper,
    Box,
    FormHelperText,
    IconButton,
    Tooltip,
} from '@mui/material';

import { Edit as EditIcon, Info as IconInfo } from '@mui/icons-material';

import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';

import { address2alias, nonDirect2direct, direct2nonDirect, alias2address } from '../Components/Utils';
import settingsInputs from '../data/optionsSettings.json';
import type { OptionField, ModbusAdapterConfig, RegisterType } from '../types';

const settingsInputsTyped = settingsInputs as OptionField[];

const styles: Record<string, React.CSSProperties> = {
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

function text2react(text: string): React.JSX.Element[] | string {
    if (!text.includes('\n')) {
        return text;
    }
    const lines = text.split('\n');
    return lines.map((line, i) => <p key={i}>{line}</p>);
}

interface SettingsProps {
    common: ioBroker.InstanceCommon;
    native: ModbusAdapterConfig;
    instance: number;
    adapterName: string;
    socket: AdminConnection;
    changeNative: (native: ioBroker.AdapterConfig) => void;
}

interface SettingsState {
    ports: { value: string; title: string }[] | null;
    customPort: string | boolean;
    ips: { value: string; title: string }[] | null;
}

export default class Settings extends Component<SettingsProps, SettingsState> {
    constructor(props: SettingsProps) {
        super(props);

        this.state = {
            ports: null,
            customPort: false,
            ips: null,
        };
    }

    inputDisabled(input: OptionField): boolean {
        if (input.name === 'doNotUseWriteMultipleRegisters' && this.props.native.params.onlyUseWriteMultipleRegisters) {
            return true;
        }
        if (input.name === 'onlyUseWriteMultipleRegisters' && this.props.native.params.doNotUseWriteMultipleRegisters) {
            return true;
        }
        return false;
    }

    getInputsBlock(inputs: OptionField[], title: string): React.JSX.Element {
        return (
            <Paper style={styles.optionsContainer}>
                <Typography
                    variant="h4"
                    gutterBottom
                    style={styles.header}
                >
                    {I18n.t(title)}
                </Typography>
                {inputs.map(input => {
                    if (
                        input.name === 'bind' &&
                        this.props.native.params.type !== 'serial' &&
                        this.props.native.params.slave === '1'
                    ) {
                        return (
                            <Box
                                style={styles.optionContainer}
                                key={input.name}
                            >
                                {this.state.ips ? (
                                    <FormControl>
                                        <InputLabel>{I18n.t('Slave IP address')}</InputLabel>
                                        <Select
                                            variant="standard"
                                            style={styles.optionsSelect}
                                            disabled={this.inputDisabled(input)}
                                            value={this.props.native.params[input.name] || ''}
                                            onChange={e => this.changeParam(input.name, e.target.value)}
                                        >
                                            {this.state.ips.map(option => (
                                                <MenuItem
                                                    key={option.value}
                                                    value={option.value}
                                                >
                                                    {option.title}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                ) : (
                                    <TextField
                                        variant="standard"
                                        type={input.type}
                                        label={I18n.t('Slave IP address')}
                                        style={styles.optionsTextField}
                                        disabled={this.inputDisabled(input)}
                                        helperText={input.help ? I18n.t(input.help) : ''}
                                        value={this.props.native.params[input.name]}
                                        slotProps={{
                                            input: {
                                                endAdornment: input.dimension ? (
                                                    <InputAdornment position="end">
                                                        {I18n.t(input.dimension)}
                                                    </InputAdornment>
                                                ) : null,
                                            },
                                        }}
                                        onChange={e => this.changeParam(input.name, e.target.value)}
                                    />
                                )}
                            </Box>
                        );
                    }
                    if (input.type === 'checkbox') {
                        return (
                            <FormControl
                                style={styles.optionContainer}
                                key={input.name}
                            >
                                <div>
                                    <FormControlLabel
                                        label={I18n.t(input.title)}
                                        control={
                                            <Checkbox
                                                disabled={this.inputDisabled(input)}
                                                checked={this.props.native.params[input.name] as boolean}
                                                onChange={e => this.changeParam(input.name, e.target.checked)}
                                            />
                                        }
                                    />
                                    {input.help ? (
                                        <FormHelperText style={styles.helperText}>{I18n.t(input.help)}</FormHelperText>
                                    ) : null}
                                </div>
                                {input.tooltip ? (
                                    <Tooltip title={text2react(I18n.t(input.tooltip))}>
                                        <IconInfo />
                                    </Tooltip>
                                ) : null}
                            </FormControl>
                        );
                    }
                    if (input.type === 'select') {
                        return (
                            <Box
                                style={styles.optionContainer}
                                key={input.name}
                            >
                                <FormControl style={{ marginRight: 8 }}>
                                    <InputLabel>{I18n.t(input.title)}</InputLabel>
                                    <Select
                                        variant="standard"
                                        style={styles.optionsSelect}
                                        disabled={this.inputDisabled(input)}
                                        value={this.props.native.params[input.name] || ''}
                                        onChange={e => this.changeParam(input.name, e.target.value)}
                                    >
                                        {input.options?.map(option => (
                                            <MenuItem
                                                key={option.value}
                                                value={option.value}
                                            >
                                                {option.title}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                {input.dimension ? I18n.t(input.dimension) : null}
                                {input.tooltip ? (
                                    <Tooltip title={text2react(I18n.t(input.tooltip))}>
                                        <IconInfo />
                                    </Tooltip>
                                ) : null}
                            </Box>
                        );
                    }
                    if (input.type === 'ports') {
                        return (
                            <Box
                                style={styles.optionContainer}
                                key={input.name}
                            >
                                {this.state.ports && !this.state.customPort ? (
                                    <FormControl>
                                        <InputLabel>{I18n.t(input.title)}</InputLabel>
                                        <Select
                                            variant="standard"
                                            style={styles.optionsSelect}
                                            disabled={this.inputDisabled(input)}
                                            value={this.props.native.params[input.name] || ''}
                                            onChange={e => this.changeParam(input.name, e.target.value)}
                                        >
                                            {this.state.ports.map(option => (
                                                <MenuItem
                                                    key={option.value}
                                                    value={option.value}
                                                >
                                                    {option.title}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                ) : (
                                    <TextField
                                        variant="standard"
                                        type={input.type}
                                        label={I18n.t(input.title)}
                                        style={styles.optionsTextField}
                                        disabled={this.inputDisabled(input)}
                                        helperText={input.help ? I18n.t(input.help) : ''}
                                        value={this.props.native.params[input.name]}
                                        InputProps={{
                                            endAdornment: input.dimension ? (
                                                <InputAdornment position="end">
                                                    {I18n.t(input.dimension)}
                                                </InputAdornment>
                                            ) : null,
                                        }}
                                        onChange={e => this.changeParam(input.name, e.target.value)}
                                    />
                                )}
                                {this.state.ports ? (
                                    <IconButton onClick={() => this.setState({ customPort: !this.state.customPort })}>
                                        <EditIcon />
                                    </IconButton>
                                ) : null}
                            </Box>
                        );
                    }

                    const inputProps: {
                        min?: number;
                        max?: number;
                    } = {};
                    if (input.min !== undefined) {
                        inputProps.min = input.min;
                    }
                    if (input.max !== undefined) {
                        inputProps.max = input.max;
                    }

                    return (
                        <Box
                            style={styles.optionContainer}
                            key={input.name}
                        >
                            <TextField
                                variant="standard"
                                type={input.type}
                                label={I18n.t(input.title)}
                                style={styles.optionsTextField}
                                slotProps={{
                                    htmlInput: inputProps,
                                    input: {
                                        endAdornment: input.dimension ? (
                                            <InputAdornment position="end">{I18n.t(input.dimension)}</InputAdornment>
                                        ) : null,
                                    },
                                }}
                                disabled={this.inputDisabled(input)}
                                helperText={input.help ? I18n.t(input.help) : ''}
                                value={this.props.native.params[input.name]}
                                onChange={e => this.changeParam(input.name, e.target.value)}
                            />
                            {input.tooltip ? (
                                <Tooltip title={text2react(I18n.t(input.tooltip))}>
                                    <IconInfo />
                                </Tooltip>
                            ) : null}
                        </Box>
                    );
                })}
            </Paper>
        );
    }

    changeParam(name: OptionField['name'], value: string | number | boolean): void {
        const native: ModbusAdapterConfig = JSON.parse(JSON.stringify(this.props.native));
        (native.params as any)[name] = value;
        if (name === 'showAliases') {
            ['disInputs', 'inputRegs', 'holdingRegs', 'coils'].forEach((nativeParam: RegisterType): void => {
                native[nativeParam].forEach(item => {
                    if (value) {
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
            });
        } else if (name === 'directAddresses' && native.params.showAliases) {
            ['disInputs', 'coils'].forEach((nativeParam: RegisterType): void => {
                native[nativeParam as 'disInputs' | 'coils'].forEach(item => {
                    if (value) {
                        item._address = nonDirect2direct(nativeParam, item._address);
                    } else {
                        item._address = direct2nonDirect(nativeParam, item._address);
                    }
                });
            });
        }
        this.props.changeNative(native);
    }

    render(): React.JSX.Element {
        return (
            <div style={{ width: '100%', minHeight: '100%' }}>
                {this.getInputsBlock(settingsInputsTyped, 'General')}
            </div>
        );
    }
}
