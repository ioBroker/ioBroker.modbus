import React, { useState, useEffect } from 'react';
import { tsv2json, json2tsv } from 'tsv-json';
import AceEditor from 'react-ace';
import 'ace-builds/src-min-noconflict/theme-clouds_midnight';
import 'ace-builds/src-min-noconflict/theme-chrome';

import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button, Snackbar } from '@mui/material';

import { Clear as ClearIcon, Save as SaveIcon, FileCopy as FileCopyIcon } from '@mui/icons-material';

import { I18n, type ThemeType, Utils } from '@iobroker/adapter-react-v5';
import type { Register, RegisterField } from '../types';

const styles = {
    tsvEditor: {
        width: '100%',
        height: 400,
    },
};

export default function TsvDialog(props: {
    onClose: () => void;
    save: (data: Register[]) => void;
    fields: RegisterField[];
    data: Register[];
    themeType: ThemeType;
}): React.JSX.Element {
    const [tsv, setTsv] = useState('');
    const [message, setMessage] = useState<React.JSX.Element | null>(null);

    useEffect(() => {
        const tsvResult = [];
        tsvResult.push(props.fields.map(field => field.name));
        props.data.forEach(item =>
            tsvResult.push(
                props.fields.map(field =>
                    item[field.name] !== undefined && item[field.name] !== null
                        ? item[field.name]?.toString() || ''
                        : '',
                ),
            ),
        );
        setTsv(json2tsv(tsvResult));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const saveTsv = (): void => {
        const data: (string | boolean)[][] = tsv2json(tsv.endsWith('\n') ? tsv : `${tsv}\n`);
        const fields = data.shift();
        let success = true;
        const errors = [];
        if (fields) {
            for (const index in props.fields) {
                if (props.fields[index].name !== fields[index]) {
                    errors.push(
                        <>
                            No field <i>{props.fields[index].name}</i> in position <i>{parseInt(index) + 1}</i>!
                        </>,
                    );
                    success = false;
                }
            }
        }

        const dataTyped: Register[] = data.map((itemValues, itemIndex) => {
            const item: Register = {} as Register;
            for (const index in props.fields) {
                if (
                    props.fields[index].type === 'select' &&
                    !props.fields[index].options?.map(option => option.value).includes(itemValues[index] as string)
                ) {
                    errors.push(
                        <>
                            Value <i>{itemValues[index]}</i> is wrong for field <i>{props.fields[index].name}</i> in
                            position <i>{itemIndex + 1}</i>!
                        </>,
                    );
                    success = false;
                }
                if (props.fields[index].type === 'checkbox') {
                    itemValues[index] = itemValues[index] === 'true';
                }
                (item as unknown as Record<string, string | boolean | number>)[props.fields[index].name] =
                    itemValues[index];
            }
            return item;
        });

        if (!success) {
            setMessage(
                <div style={{ color: 'red' }}>
                    {errors.map((error, index) => (
                        <div key={index}>{error}</div>
                    ))}
                </div>,
            );
            return;
        }
        props.save(dataTyped);
        props.onClose();
    };

    return (
        <Dialog
            open={!0}
            onClose={props.onClose}
            maxWidth="lg"
            fullWidth
        >
            <Snackbar
                open={!!message}
                autoHideDuration={8000}
                onClose={() => setMessage(null)}
                message={message}
            />
            <DialogTitle>{I18n.t('Edit data as TSV')}</DialogTitle>
            <DialogContent>
                <DialogContentText>{I18n.t('You can copy, paste and edit data as TSV.')}</DialogContentText>
                <div>
                    <AceEditor
                        theme={props.themeType === 'dark' ? 'clouds_midnight' : 'chrome'}
                        onChange={e => setTsv(e)}
                        height="400px"
                        showPrintMargin={false}
                        value={tsv}
                        style={styles.tsvEditor}
                        width="100%"
                        setOptions={{ firstLineNumber: 0 }}
                    />
                </div>
            </DialogContent>
            <DialogActions>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => {
                        Utils.copyToClipboard(tsv);
                        setMessage(<span>{I18n.t('TSV was copied to clipboard')}</span>);
                    }}
                    startIcon={<FileCopyIcon />}
                >
                    {I18n.t('Copy to clipboard')}
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={saveTsv}
                    startIcon={<SaveIcon />}
                >
                    {I18n.t('Import')}
                </Button>
                <Button
                    variant="contained"
                    color="grey"
                    onClick={props.onClose}
                    startIcon={<ClearIcon />}
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
