import PropTypes from 'prop-types';

import I18n from '@iobroker/adapter-react/i18n';

import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';

import DeleteIcon from '@material-ui/icons/Delete';
import ClearIcon from '@material-ui/icons/Clear';

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
                <Button variant="contained" onClick={props.onClose} startIcon={<ClearIcon />}>{I18n.t('Cancel')}</Button>
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