import React from 'react';

import { Alert, Box, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';

import { I18n } from '@iobroker/gui-components';
import type { Modbus } from '@iobroker/modbus';

/** Per-device settings entry. */
interface DeviceEntry {
    timeout?: number;
    waitTime?: number;
}

/**
 * `deviceTimeouts` is stored at the top level of the native config (sibling to the register
 * arrays), keyed by device ID. It is added to the `@iobroker/modbus` types from 7.5.1 on; the
 * intersection keeps this component compiling against older type packages too.
 */
type ConfigWithTimeouts = Modbus.ModbusAdapterConfig & { deviceTimeouts?: { [deviceId: string]: DeviceEntry } };

interface DeviceTimeoutTableProps {
    native: Modbus.ModbusAdapterConfig;
    onChange: (native: Modbus.ModbusAdapterConfig) => void;
}

/** Collect all distinct device IDs actually used across the four register tables. */
function collectDeviceIds(native: Modbus.ModbusAdapterConfig): number[] {
    const parsedDeviceId = parseInt(native.params?.deviceId as string, 10);
    const defaultDeviceId = Number.isNaN(parsedDeviceId) ? 1 : parsedDeviceId;
    const ids = new Set<number>();
    const arrays: (Modbus.Register[] | undefined)[] = [
        native.disInputs,
        native.coils,
        native.inputRegs,
        native.holdingRegs,
    ];
    for (const arr of arrays) {
        if (!Array.isArray(arr)) {
            continue;
        }
        for (const reg of arr) {
            const hasId = reg.deviceId !== undefined && reg.deviceId !== null && `${reg.deviceId}` !== '';
            const id = hasId ? parseInt(reg.deviceId as string, 10) : defaultDeviceId;
            if (!isNaN(id)) {
                ids.add(id);
            }
        }
    }
    return Array.from(ids).sort((a, b) => a - b);
}

export default function DeviceTimeoutTable(props: DeviceTimeoutTableProps): React.JSX.Element {
    const deviceIds = collectDeviceIds(props.native);
    const deviceTimeouts = (props.native as ConfigWithTimeouts).deviceTimeouts || {};

    const globalTimeout = parseInt(props.native.params?.timeout as string, 10);
    const globalTimeoutPlaceholder = `${isNaN(globalTimeout) ? 5000 : globalTimeout}`;
    const globalWaitTime = parseInt(props.native.params?.waitTime as string, 10);
    const globalWaitTimePlaceholder = `${isNaN(globalWaitTime) ? 50 : globalWaitTime}`;

    const setField = (id: number, field: keyof DeviceEntry, value: string): void => {
        const native: ConfigWithTimeouts = JSON.parse(JSON.stringify(props.native));
        const timeouts = { ...(native.deviceTimeouts || {}) };
        const entry: DeviceEntry = { ...(timeouts[`${id}`] || {}) };
        const num = parseInt(value, 10);
        // timeout must be > 0; waitTime may be 0 (no wait). Empty/invalid removes the field.
        const min = field === 'timeout' ? 1 : 0;
        if (value === '' || isNaN(num) || num < min) {
            delete entry[field];
        } else {
            entry[field] = num;
        }
        if (entry.timeout === undefined && entry.waitTime === undefined) {
            delete timeouts[`${id}`];
        } else {
            timeouts[`${id}`] = entry;
        }
        native.deviceTimeouts = timeouts;
        props.onChange(native);
    };

    return (
        <Box sx={{ mt: 2, mb: 2 }}>
            <Typography
                variant="h6"
                gutterBottom
            >
                {I18n.t('Per-device timeouts')}
            </Typography>
            <Alert
                severity="info"
                sx={{ mb: 1 }}
            >
                {I18n.t(
                    'Device IDs appear here only after they are used in the register tables. Leave a field empty to use the global value.',
                )}
            </Alert>
            {deviceIds.length ? (
                <Table
                    size="small"
                    style={{ maxWidth: 650 }}
                >
                    <TableHead>
                        <TableRow>
                            <TableCell>{I18n.t('Device ID')}</TableCell>
                            <TableCell>{I18n.t('Timeout (ms)')}</TableCell>
                            <TableCell>{I18n.t('Wait time (ms)')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {deviceIds.map(id => {
                            const entry = deviceTimeouts[`${id}`] || {};
                            return (
                                <TableRow key={id}>
                                    <TableCell>{id}</TableCell>
                                    <TableCell>
                                        <TextField
                                            variant="standard"
                                            type="number"
                                            size="small"
                                            value={entry.timeout ?? ''}
                                            placeholder={globalTimeoutPlaceholder}
                                            slotProps={{ htmlInput: { min: 1 } }}
                                            onChange={e => setField(id, 'timeout', e.target.value)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            variant="standard"
                                            type="number"
                                            size="small"
                                            value={entry.waitTime ?? ''}
                                            placeholder={globalWaitTimePlaceholder}
                                            slotProps={{ htmlInput: { min: 0 } }}
                                            onChange={e => setField(id, 'waitTime', e.target.value)}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            ) : (
                <Typography
                    variant="body2"
                    color="textSecondary"
                >
                    {I18n.t('No device IDs are used in the register tables yet.')}
                </Typography>
            )}
        </Box>
    );
}
