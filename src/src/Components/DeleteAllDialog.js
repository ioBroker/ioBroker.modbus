import PropTypes from 'prop-types';

import I18n from '@iobroker/adapter-react-v5/i18n';

import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';

import DeleteIcon from '@mui/icons-material/Delete';
import ClearIcon from '@mui/icons-material/Clear';

const DeleteAllDialog = (props) => {
    return props.open ? <Dialog open={props.open} onClose={props.onClose}>
        <DialogTitle>{I18n.t('Delete all items')}</DialogTitle>
        <DialogContent>
            <DialogContentText>{I18n.t('Are you sure to delete all items?')}</DialogContentText>
            <DialogActions>
                <Button variant="contained" color="secondary" startIcon={<DeleteIcon />} onClick={() => {
                    props.action();
                    props.onClose();
                }}>{I18n.t('Delete all items')}</Button>
                <Button variant="contained" color="grey" onClick={props.onClose} startIcon={<ClearIcon />}>{I18n.t('Cancel')}</Button>
            </DialogActions>
        </DialogContent>
    </Dialog> : null;
}

DeleteAllDialog.propTypes = {
    open: PropTypes.bool,
    action: PropTypes.func,
    onClose: PropTypes.func,
    classes: PropTypes.object,
}

export default DeleteAllDialog;