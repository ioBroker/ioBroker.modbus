import React from 'react';

import { Box, Typography, Tooltip } from '@mui/material';

import { I18n } from '@iobroker/gui-components';
import { ConfigGeneric, type ConfigGenericProps, type ConfigGenericState } from '@iobroker/json-config';

import TimingDiagram, { TIMINGS, type TimingKey } from './TimingDiagrams';

/**
 * Custom JSON config item that shows the timing diagram of one field.
 *
 * Used in the schema as `{ type: 'component', subType: 'timingHelp', diagram: '<params key>' }` and
 * registered at `JsonConfigComponent` via `customComponents`. The small pictogram sits next to the
 * input field, hovering it opens the explained diagram together with the translated help text.
 */
export default class ConfigTimingHelp extends ConfigGeneric<ConfigGenericProps, ConfigGenericState> {
    renderItem(): React.JSX.Element | null {
        const diagram = (this.props.schema as unknown as { diagram?: TimingKey }).diagram;
        const info = diagram ? TIMINGS[diagram] : undefined;
        if (!diagram || !info) {
            return null;
        }
        const themeType = this.props.oContext.themeType;

        const explanation = (
            <Box sx={{ width: { xs: 300, sm: 460, md: 540 } }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 0.5 }}>{I18n.t(info.label)}</Typography>
                <TimingDiagram
                    id={diagram}
                    themeType={themeType}
                    variant="large"
                />
                <Typography sx={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.7, mt: 0.5 }}>
                    {info.signature}
                </Typography>
                <Typography sx={{ fontSize: 12, mt: 0.5, whiteSpace: 'pre-line' }}>{I18n.t(info.help)}</Typography>
            </Box>
        );

        return (
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', minHeight: 48 }}>
                <Tooltip
                    title={explanation}
                    placement="top"
                    enterTouchDelay={100}
                    leaveTouchDelay={10000}
                    slotProps={{
                        tooltip: {
                            sx: {
                                maxWidth: 'none',
                                p: 1.5,
                                bgcolor: 'background.paper',
                                color: 'text.primary',
                                border: '1px solid',
                                borderColor: 'divider',
                                boxShadow: 6,
                            },
                        },
                    }}
                >
                    <Box
                        sx={{
                            width: '100%',
                            maxWidth: 120,
                            minWidth: 64,
                            p: '4px 6px',
                            cursor: 'help',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            bgcolor: 'action.hover',
                            transition: 'border-color 0.15s, transform 0.15s',
                            '&:hover': { borderColor: 'primary.main', transform: 'scale(1.04)' },
                        }}
                    >
                        <TimingDiagram
                            id={diagram}
                            themeType={themeType}
                            variant="small"
                        />
                    </Box>
                </Tooltip>
            </Box>
        );
    }
}
