import I18n from '@iobroker/adapter-react/i18n';

import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';

const DeleteDialog = (props) => {
    return <Dialog open={props.open} onClose={props.onClose}>
        <DialogTitle>{I18n.t(props.title)}</DialogTitle>
        <DialogContent>
            <DialogContentText>{I18n.t(props.text)}</DialogContentText>
            <DialogActions>
                <Button variant="contained" color="secondary" onClick={() => {
                    props.action();
                    props.onClose();
                }}>{I18n.t(props.actionTitle)}</Button>
                <Button variant="contained" onClick={props.onClose}>{I18n.t('Cancel')}</Button>
            </DialogActions>
        </DialogContent>
    </Dialog>
}

export default DeleteDialog;