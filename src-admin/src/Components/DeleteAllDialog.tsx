import React from 'react';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';

import { Delete as DeleteIcon, Clear as ClearIcon } from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';

export default function DeleteAllDialog(props: {
    open: boolean;
    action: () => void;
    onClose: () => void;
}): React.JSX.Element | null {
    return props.open ? (
        <Dialog
            open={props.open}
            onClose={props.onClose}
        >
            <DialogTitle>{I18n.t('Delete all items')}</DialogTitle>
            <DialogContent>
                <DialogContentText>{I18n.t('Are you sure to delete all items?')}</DialogContentText>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="secondary"
                        startIcon={<DeleteIcon />}
                        onClick={() => {
                            props.action();
                            props.onClose();
                        }}
                    >
                        {I18n.t('Delete all items')}
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
