import { useState, useEffect } from 'react';

import { tsv2json, json2tsv } from 'tsv-json';
import { useSnackbar } from 'notistack';

import I18n from '@iobroker/adapter-react/i18n';

import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';

const TsvDialog = (props) => {
    const [tsv, setTsv] = useState('');
    useEffect(() => {
        let tsvResult = [];
        tsvResult.push(props.fields.map(field => field.name));
        props.data.forEach(item => 
            tsvResult.push(props.fields.map(field => item[field.name] !== undefined ? item[field.name].toString() : ''))
        );
        setTsv(json2tsv(tsvResult));
    }, [props.open]);
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
        console.log(data);
        if (!success) {
            enqueueSnackbar(<div>{errors.map((error, index) => <div key={index}>{error}</div>)}</div>, { variant: 'error' });
            return;
        }
        props.save(data);
        props.onClose();
    };

    return <Dialog open={props.open} onClose={props.onClose} fullScreen>
        <DialogTitle>{I18n.t('Edit data as TSV')}</DialogTitle>
        <DialogContent>
            <DialogContentText>{I18n.t('You can copy, paste and edit data as TSV.')}</DialogContentText>
            <div>
                <TextField onChange={e => setTsv(e.target.value)} multiline value={tsv} style={{width: '100%', height: '100%'}} inputProps={{style: {fontFamily: 'monospace'}}}/>
            </div>
            <DialogActions>
                <Button onClick={saveTsv}>{'Save'}</Button>
                <Button onClick={props.onClose}>{'Cancel'}</Button>
            </DialogActions>
        </DialogContent>
    </Dialog>
}

export default TsvDialog;