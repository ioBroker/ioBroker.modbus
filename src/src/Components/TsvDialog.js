import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {withStyles} from '@material-ui/core/styles';

import { tsv2json, json2tsv } from 'tsv-json';
import { useSnackbar } from 'notistack';
import AceEditor from "react-ace";
import copy from 'copy-to-clipboard';

import I18n from '@iobroker/adapter-react/i18n';

import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Button from '@material-ui/core/Button';

import ClearIcon from '@material-ui/icons/Clear';
import SaveIcon from '@material-ui/icons/Save';
import FileCopyIcon from '@material-ui/icons/FileCopy';

const styles = theme => ({
    tsvEditor: {
        width: '100%',
        height: 400
    },
    tsvEditorTextarea: {
        fontFamily: 'monospace'
    }
});

const TsvDialog = (props) => {
    const [tsv, setTsv] = useState('');
    useEffect(() => {
        let tsvResult = [];
        tsvResult.push(props.fields.map(field => field.name));
        props.data.forEach(item =>
            tsvResult.push(props.fields.map(field => item[field.name] !== undefined ? item[field.name].toString() : ''))
        );
        setTsv(json2tsv(tsvResult));
    }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps
    const { enqueueSnackbar } = useSnackbar();

    if (!props.open) {
        return null;
    }

    const saveTsv = () => {
        let data = tsv2json(tsv);
        let fields = data.shift();
        let success = true;
        let errors = [];
        for (let index in props.fields) {
            if (props.fields[index].name !== fields[index]) {
                errors.push(<>No field <i>{props.fields[index].name}</i> in position <i>{parseInt(index) + 1}</i>!</>);
                success = false;
            }
        }

        data = data.map((itemValues, itemIndex) => {
            let item = {};
            for (let index in props.fields) {
                if (props.fields[index].type === 'select' && !props.fields[index].options.map(option => option.value).includes(itemValues[index])) {
                    errors.push(<>Value <i>{itemValues[index]}</i> is wrong for field <i>{props.fields[index].name}</i> in position <i>{parseInt(itemIndex) + 1}</i>!</>);
                    success = false;
                }
                if (props.fields[index].type === 'checkbox') {
                    itemValues[index] = itemValues[index] === 'true' ? true : false;
                }
                item[props.fields[index].name] = itemValues[index];
            }
            return item;
        });

        if (!success) {
            enqueueSnackbar(<div>{errors.map((error, index) => <div key={index}>{error}</div>)}</div>, { variant: 'error' });
            return;
        }
        props.save(data);
        props.onClose();
    };

    return <Dialog
        open={props.open}
        onClose={props.onClose}
        maxWidth="lg"
        fullWidth
    >
        <DialogTitle>{I18n.t('Edit data as TSV')}</DialogTitle>
        <DialogContent>
            <DialogContentText>{I18n.t('You can copy, paste and edit data as TSV.')}</DialogContentText>
            <div>
                <AceEditor 
                    onChange={e => setTsv(e)} 
                    height="400px" 
                    showPrintMargin={false} 
                    value={tsv} 
                    className={props.classes.tsvEditor} 
                    width="100%" 
                    setOptions={{firstLineNumber: 0}}
                    mode={null}
                />
            </div>
        </DialogContent>
        <DialogActions>
            <Button variant="outlined" color="primary" onClick={() => {
                copy(tsv);
                enqueueSnackbar(I18n.t('TSV was copied to clipboard'));
            }} startIcon={<FileCopyIcon />}>{I18n.t('Copy to clipboard')}</Button>
            <Button variant="contained" color="primary" onClick={saveTsv} startIcon={<SaveIcon />}>{I18n.t('Import')}</Button>
            <Button variant="contained" onClick={props.onClose} startIcon={<ClearIcon />}>{I18n.t('Close')}</Button>
        </DialogActions>
    </Dialog>
}

TsvDialog.propTypes = {
    open: PropTypes.bool,
    onClose: PropTypes.func,
    classes: PropTypes.object,
    save: PropTypes.func,
    fields: PropTypes.array,
    data: PropTypes.array
}

export default withStyles(styles)(TsvDialog);