import React, { useState, useEffect } from 'react';

import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Button,
    FormControlLabel,
    Checkbox,
} from '@mui/material';

import { Clear as ClearIcon } from '@mui/icons-material';

import { I18n, IconTrash } from '@iobroker/gui-components';
import type { Modbus } from '@iobroker/modbus';

export default function DeleteDialog(props: {
    open: boolean;
    action: (disableWarnings: boolean) => void;
    onClose: () => void;
    item: Modbus.Register;
}): React.JSX.Element | null {
    const [disableWarnings, setDisableWarnings] = useState(false);
    useEffect(() => {
        setDisableWarnings(false);
    }, [props.open]);

    return props.open ? (
        <Dialog
            open={props.open}
            onClose={props.onClose}
        >
            <DialogTitle>{I18n.t('Delete item')}</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {I18n.t('Are you sure to delete item with address "%s"?', props.item._address)}
                </DialogContentText>
                <DialogContentText>
                    <FormControlLabel
                        label={I18n.t("Don't show this message in 5 minutes")}
                        control={
                            <Checkbox
                                checked={disableWarnings}
                                onChange={e => setDisableWarnings(e.target.checked)}
                            />
                        }
                    />
                </DialogContentText>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<IconTrash />}
                        onClick={() => {
                            props.action(disableWarnings);
                            props.onClose();
                        }}
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={props.onClose}
                        startIcon={<ClearIcon />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </DialogContent>
        </Dialog>
    ) : null;
}
