import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import I18n from '@iobroker/adapter-react-v5/i18n';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';

import DeleteIcon from '@mui/icons-material/Delete';
import ClearIcon from '@mui/icons-material/Clear';

const DeleteDialog = (props) => {
    const [disableWarnings, setDisableWarnings] = useState(false);
    useEffect(() => {
        setDisableWarnings(false);
    }, [props.open]);

    return props.open ? <Dialog open={props.open} onClose={props.onClose}>
        <DialogTitle>{I18n.t('Delete item')}</DialogTitle>
        <DialogContent>
            <DialogContentText>{I18n.t('Are you sure to delete item with address "%s"?', props.item._address)}</DialogContentText>
            <DialogContentText><FormControlLabel
                label={I18n.t('Don\'t show this message in 5 minutes')}
                control={<Checkbox
                    checked={disableWarnings}
                    onChange={e => setDisableWarnings(e.target.checked)}
            />}/></DialogContentText>
            <DialogActions>
                <Button variant="contained" color="secondary" startIcon={<DeleteIcon />} onClick={() => {
                    props.action(disableWarnings);
                    props.onClose();
                }}>{I18n.t('Delete')}</Button>
                <Button variant="contained" color="grey" onClick={props.onClose} startIcon={<ClearIcon />}>{I18n.t('Cancel')}</Button>
            </DialogActions>
        </DialogContent>
    </Dialog> : null;
}

DeleteDialog.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    classes: PropTypes.object,
    action: PropTypes.func,
    item: PropTypes.object,
}

export default DeleteDialog;