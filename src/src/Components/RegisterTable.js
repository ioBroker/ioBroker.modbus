import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import {withStyles} from '@material-ui/core/styles';

import Table from '@material-ui/core/Table';
import TableHead from '@material-ui/core/TableHead';
import TableBody from '@material-ui/core/TableBody';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Checkbox from '@material-ui/core/Checkbox';
import TextField from '@material-ui/core/TextField';
import IconButton from '@material-ui/core/IconButton';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import Tooltip from '@material-ui/core/Tooltip';

import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import ImportExport from '@material-ui/icons/ImportExport';

import I18n from '@iobroker/adapter-react/i18n';
import Utils from '@iobroker/adapter-react/Components/Utils';

import ExpertIcon from '@iobroker/adapter-react/icons/IconExpert';
import TextWithIcon from '@iobroker/adapter-react/Components/TextWithIcon';
import SelectWithIcon from '@iobroker/adapter-react/Components/SelectWithIcon';

import TsvDialog from './TsvDialog';
import DeleteAllDialog from './DeleteAllDialog';
import DeleteDialog from './DeleteDialog';

const styles = theme => ({
    tableHeader: {
        whiteSpace: 'nowrap',
        fontWeight: 'bold',
        fontSize: '80%',
        padding: '0px 8px'
    },
    tableHeaderExtended: {
        color: theme.palette.type === 'dark' ? theme.palette.primary.light : theme.palette.primary.dark
    },
    tableCell: {
        whiteSpace: 'nowrap',
        fontSize: '80%',
        padding: '0px 8px'
    },
    tableContainer: {
        overflow: 'auto',
        maxHeight: 'calc(100vh - 180px)'
    },
    tableTextField: {
        fontSize: '80%'
    },
    tableSelect: {
        fontSize: '80%'
    },
    tableTextFieldContainer: {
        width: '100%'
    },
    tableSelectContainer: {
        width: '100%'
    },
    nonEditMode: {
        cursor: 'pointer'
    }
});

const DataCell = props => {
    const sortedItem = props.sortedItem;
    const field = props.field;
    const editMode = props.editMode;
    const setEditMode = props.setEditMode;

    const ref = useRef();

    let item = sortedItem.item;
    let result;
    if (field.type === 'checkbox') {
        if (!editMode) {
            result = <Checkbox
                checked={!!item[field.name]}
                disabled
            />;
        } else {
            result = <Tooltip title={I18n.t(field.title)}>
                <Checkbox
                    inputRef={ref}
                    className={props.classes.tableCheckbox}
                    checked={!!item[field.name]}
                    disabled={props.getDisable(sortedItem.$index, field.name)}
                    onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.checked)}
                />
            </Tooltip>;
        }
    } else if (field.type === 'rooms') {
        if (!editMode) {
            result = <TextWithIcon list={props.rooms} value={item[field.name]}/>;
        } else {
            result = <SelectWithIcon
                list={props.rooms}
                allowNone={true}
                value={item[field.name] === undefined || item[field.name] === null ? '' : item[field.name]}
                dense={true}
                inputProps={{ref, className: props.classes.tableSelect}}
                disabled={props.getDisable(sortedItem.$index, field.name)}
                onChange={value => props.changeParam(sortedItem.$index, field.name, value)}
                className={props.classes.tableSelectContainer}
            />;
        }
    } else if (field.type === 'select') {
        if (!editMode) {
            let option = field.options.find(option => option.value === item[field.name]);
            result = option ? option.title : '';
        } else {
            result = <Select
                value={item[field.name] === undefined || item[field.name] === null ? '' : item[field.name]}
                inputProps={{ref, className: props.classes.tableSelect}}
                disabled={props.getDisable(sortedItem.$index, field.name)}
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
                className={props.classes.tableSelectContainer}
            >
                {field.options.map(option =>
                    <MenuItem key={option.value} value={option.value}>{option.title ? option.title : <i>{I18n.t('Nothing')}</i>}</MenuItem>
                )}
            </Select>;
        }
    } else {
        if (!editMode) {
            result = item[field.name] ? item[field.name] : null;
        } else {
            result = <TextField
                value={item[field.name] === undefined || item[field.name] === null ? '' : item[field.name]}
                className={props.classes.tableTextFieldContainer}
                inputProps={{ref: ref, className: props.classes.tableTextField}}
                type={field.type}
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
                disabled={props.getDisable(sortedItem.$index, field.name)}
            />;
        }
    }

    return <TableCell
        className={Utils.clsx(props.classes.tableCell, !editMode && props.classes.nonEditMode)}
        onClick={e => {
            setEditMode(true);
            window.localStorage.setItem('Modbus.editMode', 'true');
            window.setTimeout(() => ref.current && ref.current.focus(), 100);
        }}
    >
        {result}
    </TableCell>;
}

const RegisterTable = props => {
    const [tsvDialogOpen, setTsvDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState(window.localStorage.getItem('Modbus.editMode') !== 'false');
    const [extendedMode, setExtendedMode] = useState(window.localStorage.getItem('Modbus.extendedMode') === 'true');
    const [deleteAllDialog, setDeleteAllDialog] = useState({
        open: false,
        action: null,
    });
    const [deleteDialog, setDeleteDialog] = useState({
        open: false,
        item: null,
        action: null,
    });

    let sortedData = props.getSortedData(props.data, props.orderBy, props.order);

    return <div>
        <div>
            <Tooltip title={I18n.t('Add line')}>
                <IconButton onClick={e => props.addItem()}>
                    <AddIcon/>
                </IconButton>
            </Tooltip>
            <Tooltip title={I18n.t('Edit as TSV (Tab separated values)')}>
                <IconButton onClick={() => setTsvDialogOpen(true)}>
                    <ImportExport/>
                </IconButton>
            </Tooltip>
            <FormControlLabel
                control={<Switch checked={editMode} onChange={e => {
                    setEditMode(e.target.checked);
                    window.localStorage.setItem('Modbus.editMode', e.target.checked);
                }}/>}
                label={I18n.t('Edit mode')}
            />
            {props.showExtendedModeSwitch && <Tooltip title={I18n.t('Toggle extended mode')}>
                <IconButton
                    color={extendedMode ? 'primary' : 'inherit'}
                    onClick={() => {
                        window.localStorage.setItem('Modbus.extendedMode', extendedMode ? 'false' : 'true');
                        setExtendedMode(!extendedMode);
                    }}>
                    <ExpertIcon/>
                </IconButton>
            </Tooltip>}
        </div>
        <div className={props.classes.tableContainer}>
            <Table size="small"
                   stickyHeader
                   padding="none"
            >
                <TableHead>
                    <TableRow>
                        {props.fields.filter(item => (extendedMode || !item.expert) && (!props.formulaDisabled || !item.formulaDisabled)).map(field => {
                            let isChecked = false;
                            let indeterminate = false;
                            let trueFound = false;
                            let falseFound = false;
                            for (let k in props.data) {
                                if (props.data[k][field.name]) {
                                    isChecked = true;
                                    trueFound = true;
                                } else {
                                    isChecked = false;
                                    falseFound = true;
                                }

                                if (trueFound && falseFound) {
                                    indeterminate = true;
                                    isChecked = false;
                                    break;
                                }
                            }

                            return <TableCell
                                key={field.name}
                                style={{width: field.type === 'checkbox' ? 20 : field.width}}
                                className={Utils.clsx(props.classes.tableHeader, field.expert && props.classes.tableHeaderExtended)}
                                title={field.tooltip ? I18n.t(field.tooltip) : null}
                            >
                                {field.type === 'checkbox' ?
                                    <Tooltip title={I18n.t('Change all')}>
                                        <Checkbox
                                            indeterminate={indeterminate}
                                            checked={isChecked}
                                            onChange={e => {
                                                let newData = JSON.parse(JSON.stringify(props.data));
                                                newData.forEach(item =>
                                                    item[field.name] = e.target.checked);
                                                props.changeData(newData);
                                            }}
                                        />
                                    </Tooltip>
                                    : null}
                                {field.sorted ? <TableSortLabel
                                    active={field.name === props.orderBy}
                                    direction={props.order}
                                    onClick={e => {
                                        const isAsc = props.orderBy === field.name && props.order === 'asc';
                                        props.onChangeOrder(field.name, isAsc ? 'desc' : 'asc');
                                    }}
                                >{I18n.t(field.title)}</TableSortLabel> : I18n.t(field.title)}
                            </TableCell>
                        })}
                        <TableCell>
                            <Tooltip title={I18n.t('Delete all')}>
                                <div>
                                    <IconButton
                                        size="small"
                                        onClick={e => setDeleteAllDialog({
                                            open: true,
                                            action: () => props.changeData([]),
                                        })}
                                        disabled={!props.data.length}
                                    >
                                        <DeleteIcon/>
                                    </IconButton>
                                </div>
                            </Tooltip>
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {
                        sortedData.map(sortedItem =>
                            <TableRow hover key={sortedItem.$index}>
                                {props.fields.filter(item => (extendedMode || !item.expert) && (!props.formulaDisabled || !item.formulaDisabled)).map(field =>
                                    <DataCell
                                        sortedItem={sortedItem}
                                        field={field}
                                        editMode={editMode}
                                        rooms={props.rooms}
                                        setEditMode={setEditMode}
                                        key={field.name}
                                        {...props}
                                    />
                                )}
                                <TableCell>
                                    <Tooltip title={I18n.t('Delete')}>
                                        <div>
                                            <IconButton size="small" onClick={e => {
                                                let lastTime = window.sessionStorage.getItem('disableDeleteDialogs');
                                                if (lastTime && (new Date() - new Date(lastTime)) < 1000 * 60 * 5) {
                                                    props.deleteItem(sortedItem.$index);
                                                    return;
                                                }
                                                setDeleteDialog({
                                                    open: true,
                                                    action: disableDialogs => {
                                                        if (disableDialogs) {
                                                            window.sessionStorage.setItem('disableDeleteDialogs', (new Date()).toISOString());
                                                        }
                                                        props.deleteItem(sortedItem.$index);
                                                    },
                                                    item: sortedItem.item
                                                })
                                            }}>
                                                <DeleteIcon/>
                                            </IconButton>
                                        </div>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        )
                    }
                </TableBody>
            </Table>
        </div>
        <TsvDialog
            open={tsvDialogOpen}
            save={props.changeData}
            onClose={() => setTsvDialogOpen(false)}
            data={props.data}
            fields={props.fields}
        />
        <DeleteAllDialog
            open={deleteAllDialog.open}
            action={deleteAllDialog.action}
            onClose={() => setDeleteAllDialog({
                open: false,
                action: null,
            })}
        />
        <DeleteDialog
            open={deleteDialog.open}
            action={deleteDialog.action}
            onClose={() => setDeleteDialog({
                open: false,
                action: null,
                item: null
            })}
            item={deleteDialog.item}
        />
    </div>;
}

RegisterTable.propTypes = {
    data: PropTypes.array,
    fields: PropTypes.array,
    classes: PropTypes.object,
    addItem: PropTypes.func,
    changeData: PropTypes.func,
    deleteItem: PropTypes.func,
    rooms: PropTypes.object,
    formulaDisabled: PropTypes.bool,
    onChangeOrder: PropTypes.func,
    getSortedData: PropTypes.func,
    showExtendedModeSwitch: PropTypes.bool,
}

export default withStyles(styles)(RegisterTable);