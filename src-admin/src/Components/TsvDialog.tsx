import React, { useState, useEffect, useRef } from 'react';
import { tsv2json, json2tsv } from 'tsv-json';
import AceEditor from 'react-ace';
import 'ace-builds/src-min-noconflict/mode-json';
import 'ace-builds/src-min-noconflict/theme-clouds_midnight';
import 'ace-builds/src-min-noconflict/theme-chrome';

import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Button,
    Snackbar,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@mui/material';

import { Clear as ClearIcon, Save as SaveIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';

import { I18n, IconCopyToClipboard, IconResult, IconUpload, type ThemeType, Utils } from '@iobroker/gui-components';
import type { RegisterField } from '../types';
import type { Modbus } from '@iobroker/modbus';

type ExportFormat = 'tsv' | 'csv' | 'json';

/** CSV uses ';' as delimiter (spreadsheet-friendly, esp. in DE locales) and '"' for quoting. */
const CSV_DELIMITER = ';';

const styles = {
    tsvEditor: {
        width: '100%',
        height: 400,
    },
};

function csvEscape(value: string): string {
    if (value.includes('"') || value.includes(CSV_DELIMITER) || value.includes('\n') || value.includes('\r')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function rowsToCsv(rows: string[][]): string {
    return rows.map(row => row.map(csvEscape).join(CSV_DELIMITER)).join('\n');
}

/** Minimal RFC-4180-style CSV parser for the ';' delimiter that understands quoted fields. */
function csvToRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === CSV_DELIMITER) {
            row.push(field);
            field = '';
        } else if (c === '\n') {
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
        } else if (c !== '\r') {
            field += c;
        }
    }
    if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
    }
    return rows;
}

/**
 * Empty or missing value of a select of the sanitization group (`sanitizeAction`): use its default, the first option.
 * Exports of older versions and hand-written files often have these columns empty (issue #835).
 */
function selectDefault(field: RegisterField, value: string | undefined): string {
    if (field.type === 'select' && field.sanitize && !value && field.options?.length) {
        return field.options[0].value;
    }
    return value ?? '';
}

/** Serialize the register list into the chosen text format. */
function serialize(fields: RegisterField[], data: Modbus.Register[], format: ExportFormat): string {
    if (format === 'json') {
        const arr = data.map(item => {
            const obj: Record<string, string | boolean> = {};
            fields.forEach(field => {
                const raw = (item as unknown as Record<string, unknown>)[field.name];
                if (field.type === 'checkbox') {
                    obj[field.name] = !!raw;
                } else {
                    obj[field.name] = raw !== undefined && raw !== null ? String(raw) : '';
                }
            });
            return obj;
        });
        return JSON.stringify(arr, null, 2);
    }

    const rows: string[][] = [];
    rows.push(fields.map(field => field.name));
    data.forEach(item =>
        rows.push(
            fields.map(field => {
                const raw = (item as unknown as Record<string, unknown>)[field.name];
                return raw !== undefined && raw !== null ? String(raw) : '';
            }),
        ),
    );

    return format === 'csv' ? rowsToCsv(rows) : json2tsv(rows);
}

/** Parse the editor text (in the given format) back into typed registers, collecting any errors. */
function parse(
    fields: RegisterField[],
    text: string,
    format: ExportFormat,
): { data: Modbus.Register[]; errors: React.JSX.Element[] } {
    const errors: React.JSX.Element[] = [];

    if (format === 'json') {
        let arr: unknown;
        try {
            arr = JSON.parse(text);
        } catch (e) {
            errors.push(<>Invalid JSON: {(e as Error).message}</>);
            return { data: [], errors };
        }
        if (!Array.isArray(arr)) {
            errors.push(<>JSON must be an array of objects!</>);
            return { data: [], errors };
        }
        const data = (arr as Record<string, unknown>[]).map((obj, itemIndex) => {
            const item = {} as Modbus.Register;
            for (const field of fields) {
                const raw = obj ? obj[field.name] : undefined;
                if (field.type === 'checkbox') {
                    (item as unknown as Record<string, boolean>)[field.name] = raw === true || raw === 'true';
                } else {
                    const value = selectDefault(field, raw === undefined || raw === null ? '' : String(raw));
                    if (field.type === 'select' && !field.options?.map(option => option.value).includes(value)) {
                        errors.push(
                            <>
                                Value <i>{value}</i> is wrong for field <i>{field.name}</i> in position{' '}
                                <i>{itemIndex + 1}</i>!
                            </>,
                        );
                    }
                    (item as unknown as Record<string, string>)[field.name] = value;
                }
            }
            return item;
        });
        return { data, errors };
    }

    // tsv or csv -> 2D array of strings
    const allRows: (string | boolean)[][] =
        format === 'csv' ? csvToRows(text) : tsv2json(text.endsWith('\n') ? text : `${text}\n`);
    const header = allRows.shift();
    if (header) {
        for (let index = 0; index < fields.length; index++) {
            if (fields[index].name !== header[index]) {
                errors.push(
                    <>
                        No field <i>{fields[index].name}</i> in position <i>{index + 1}</i>!
                    </>,
                );
            }
        }
    }

    // Skip completely empty rows (e.g. a trailing newline)
    const dataRows = allRows.filter(row => row.some(cell => cell !== '' && cell !== undefined && cell !== null));

    const data = dataRows.map((itemValues, itemIndex) => {
        const item = {} as Modbus.Register;
        for (let index = 0; index < fields.length; index++) {
            let value: string | boolean = itemValues[index];
            if (typeof value !== 'boolean') {
                value = selectDefault(fields[index], value);
            }
            if (
                fields[index].type === 'select' &&
                !fields[index].options?.map(option => option.value).includes(value as string)
            ) {
                errors.push(
                    <>
                        Value <i>{value}</i> is wrong for field <i>{fields[index].name}</i> in position{' '}
                        <i>{itemIndex + 1}</i>!
                    </>,
                );
            }
            if (fields[index].type === 'checkbox') {
                value = value === 'true' || value === true;
            }
            (item as unknown as Record<string, string | boolean>)[fields[index].name] = value;
        }
        return item;
    });

    return { data, errors };
}

export default function TsvDialog(props: {
    onClose: () => void;
    save: (data: Modbus.Register[]) => void;
    fields: RegisterField[];
    data: Modbus.Register[];
    themeType: ThemeType;
    name?: string;
}): React.JSX.Element {
    const [format, setFormat] = useState<ExportFormat>(
        (window.localStorage.getItem('Modbus.exportFormat') as ExportFormat) || 'tsv',
    );
    const [text, setText] = useState('');
    const [message, setMessage] = useState<React.JSX.Element | null>(null);
    const [errorCount, setErrorCount] = useState(0);
    /** a file is being read */
    const [reading, setReading] = useState(false);
    /** a file is dragged over the editor */
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const showError = (content: React.ReactNode): void => {
        setErrorCount(errorCount + 1);
        setMessage(
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'red' }}>
                <IconResult
                    type="error"
                    replay={errorCount + 1}
                />
                <div>{content}</div>
            </div>,
        );
    };

    useEffect(() => {
        setText(serialize(props.fields, props.data, format));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const changeFormat = (newFormat: ExportFormat): void => {
        setFormat(newFormat);
        window.localStorage.setItem('Modbus.exportFormat', newFormat);
        // Re-serialize the current (saved) data into the newly selected format.
        setText(serialize(props.fields, props.data, newFormat));
    };

    const importData = (): void => {
        const { data, errors } = parse(props.fields, text, format);
        if (errors.length) {
            showError(errors.map((error, index) => <div key={index}>{error}</div>));
            return;
        }
        props.save(data);
        props.onClose();
    };

    const downloadFile = (): void => {
        const mime =
            format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/tab-separated-values';
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${props.name || 'modbus'}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const isFileDrag = (e: React.DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files');

    const readFile = (file: File): void => {
        setReading(true);
        file.text()
            .then(content => {
                // auto-detect the format from the file extension
                const lower = file.name.toLowerCase();
                let detected: ExportFormat | null = null;
                if (lower.endsWith('.json')) {
                    detected = 'json';
                } else if (lower.endsWith('.csv')) {
                    detected = 'csv';
                } else if (lower.endsWith('.tsv') || lower.endsWith('.tab') || lower.endsWith('.txt')) {
                    detected = 'tsv';
                }
                if (detected && detected !== format) {
                    setFormat(detected);
                    window.localStorage.setItem('Modbus.exportFormat', detected);
                }
                setText(content);
            })
            .catch(error => showError(error.toString()))
            // let the arrow move up at least once
            .finally(() => window.setTimeout(() => setReading(false), 600));
    };

    const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file
        if (file) {
            readFile(file);
        }
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
            <DialogTitle>{I18n.t('Edit data')}</DialogTitle>
            <DialogContent>
                <DialogContentText>{I18n.t('You can copy, paste and edit the data.')}</DialogContentText>
                <FormControl
                    variant="standard"
                    style={{ minWidth: 180, marginBottom: 8 }}
                >
                    <InputLabel>{I18n.t('Format')}</InputLabel>
                    <Select
                        value={format}
                        onChange={e => changeFormat(e.target.value)}
                    >
                        <MenuItem value="tsv">TSV</MenuItem>
                        <MenuItem value="csv">CSV (;)</MenuItem>
                        <MenuItem value="json">JSON</MenuItem>
                    </Select>
                </FormControl>
                <div
                    className={`modbus-drop-zone${dragging ? ' modbus-drop-active' : ''}`}
                    // capture phase: the editor must not get the file
                    onDragOverCapture={e => {
                        if (isFileDrag(e)) {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'copy';
                            if (!dragging) {
                                setDragging(true);
                            }
                        }
                    }}
                    onDragLeave={e => {
                        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) {
                            setDragging(false);
                        }
                    }}
                    onDropCapture={e => {
                        if (isFileDrag(e)) {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragging(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) {
                                readFile(file);
                            }
                        }
                    }}
                >
                    <AceEditor
                        mode={format === 'json' ? 'json' : 'text'}
                        theme={props.themeType === 'dark' ? 'clouds_midnight' : 'chrome'}
                        onChange={e => setText(e)}
                        height="400px"
                        showPrintMargin={false}
                        value={text}
                        style={styles.tsvEditor}
                        width="100%"
                        setOptions={{ firstLineNumber: 0 }}
                    />
                </div>
            </DialogContent>
            <DialogActions>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".tsv,.csv,.json,.txt,.tab,text/plain,text/csv,application/json"
                    style={{ display: 'none' }}
                    onChange={onFileSelected}
                />
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => fileInputRef.current?.click()}
                    startIcon={
                        <IconUpload
                            uploading={reading}
                            ready={dragging}
                        />
                    }
                    title={I18n.t('Or drop a file on the editor')}
                >
                    {I18n.t('Load from file')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    className="modbus-btn modbus-btn-download"
                    onClick={downloadFile}
                    startIcon={<FileDownloadIcon />}
                >
                    {I18n.t('Save to file')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={() => {
                        Utils.copyToClipboard(text);
                        setMessage(<span>{I18n.t('TSV was copied to clipboard')}</span>);
                    }}
                    startIcon={<IconCopyToClipboard />}
                >
                    {I18n.t('Copy to clipboard')}
                </Button>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={importData}
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
