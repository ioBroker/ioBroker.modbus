import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import {withStyles} from '@material-ui/core/styles';

import I18n from '@iobroker/adapter-react/i18n';

import TsvDialog from './TsvDialog';
import DeleteAllDialog from './DeleteAllDialog';
import DeleteDialog from './DeleteDialog';

import Table from '@material-ui/core/Table';
import TableHead from '@material-ui/core/TableHead';
import TableBody from '@material-ui/core/TableBody';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Checkbox from '@material-ui/core/Checkbox';
import Textfield from '@material-ui/core/Textfield';
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

const styles = theme => ({
    tableHeader: {
        whiteSpace: 'nowrap',
        fontWeight: 'bold',
        fontSize: '80%',
        padding: '0px 8px'
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
    tableTextfield: {
        fontSize: '80%'
    },
    tableSelect: {
        fontSize: '80%'
    },
    tableTextfieldContainer: {
        width: '100%'
    },
    tableSelectContainer: {
        width: '100%'
    }
});

const DataCell = props => {
    const sortedItem = props.sortedItem;
    const field = props.field;
    const editMode = props.editMode;
    const setEditMode = props.setEditMode;

    const ref = useRef();
    // useEffect(() => {
    //     if (props.editMode) {
    //         // ref.current && ref.current.focus()
    //         //window.setTimeout(() => ref.current && ref.current.focus(), 1000);
    //     }
    // }, [props.editMode])

    let item = sortedItem.item;
    let result = null;
    if (field.type === 'checkbox') {
        if (!editMode) {
            result = <Checkbox
                checked={!!item[field.name]}
                disabled
            />
        } else {
            result = <Checkbox
                inputRef={ref}
                className={props.classes.tableCheckbox}
                checked={!!item[field.name]}
                disabled={props.getDisable(sortedItem.$index, field.name)}
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.checked)}
            />
        }
    }
    else if (field.type === 'select') {
        if (!editMode) {
            let option = field.options.find(option => option.value === item[field.name]);
            result = option ? option.title : '';
        } else {
            result = <Select
                value={item[field.name]}
                inputProps={{ref: ref, className: props.classes.tableSelect}}
                disabled={props.getDisable(sortedItem.$index, field.name)}
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
                className={props.classes.tableSelectContainer}
            >
                {field.options.map(option =>
                    <MenuItem key={option.value} value={option.value}>{option.title ? option.title : <i>{I18n.t('Nothing')}</i>}</MenuItem>
                )}
            </Select>
        }
    } else {
        if (!editMode) {
            result = item[field.name] ? item[field.name] : null;
        } else {
            result = <Textfield value={item[field.name]} className={props.classes.tableTextfieldContainer}
                inputProps={{ref: ref, className: props.classes.tableTextfield}}
                type={field.type}
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
                disabled={props.getDisable(sortedItem.$index, field.name)}
            />
        }
    }

    return <TableCell
        className={props.classes.tableCell}
        onClick={e => {
            setEditMode(true);
            window.setTimeout(() => ref.current && ref.current.focus(), 100);
        }}
        style={{
            cursor: editMode ? null : 'pointer'
        }}
        // style={{padding: '0px 4px', border: 0}}
    >
        {result}
    </TableCell>
}

const RegisterTable = props => {
    const [tsvDialogOpen, setTsvDialogOpen] = useState(false);
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('_address');
    const [editMode, setEditMode] = useState(true);
    const [deleteAllDialog, setDeleteAllDialog] = useState({
        open: false,
        action: null,
    });
    const [deleteDialog, setDeleteDialog] = useState({
        open: false,
        item: null,
        action: null,
    });

    let sortedData = []
    props.data.forEach((item, index) => {sortedData[index] = {item: item, $index: index}});
    sortedData.sort((sortedItem1, sortedItem2) => {
        if (orderBy === '$index') {
            return (order === 'asc' ? sortedItem1[orderBy] > sortedItem2[orderBy] : sortedItem1[orderBy] < sortedItem2[orderBy]) ? 1 : -1;
        } else {
            return (order === 'asc' ? sortedItem1.item[orderBy] > sortedItem2.item[orderBy] : sortedItem1.item[orderBy] < sortedItem2.item[orderBy]) ? 1 : -1;
        }
    });

    return <div>
            <div>
                <Tooltip title={I18n.t('Add')}>
                    <IconButton onClick={e => props.addItem()}>
                        <AddIcon/>
                    </IconButton>
                </Tooltip>
                <Tooltip title={I18n.t('Edit as TSV')}>
                    <IconButton onClick={() => setTsvDialogOpen(true)}>
                        <ImportExport/>
                    </IconButton>
                </Tooltip>
                <FormControlLabel
                    control={<Switch checked={editMode} onChange={e => setEditMode(e.target.checked)} />}
                    label={I18n.t('Edit mode')}
                />
            </div>
            <div className={props.classes.tableContainer}>
                <Table size="small"
                    stickyHeader
                    padding="none"
                >
                    <TableHead>
                        <TableRow>
                            {props.fields.map(field => {
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
                                    className={props.classes.tableHeader}
                                >
                                    {field.type === 'checkbox' ?
                                        <Tooltip title={I18n.t('Change all')}>
                                            <Checkbox
                                                indeterminate={indeterminate}
                                                checked={isChecked}
                                                onChange={e => {
                                                    let newData = JSON.parse(JSON.stringify(props.data));
                                                    newData.forEach(item => {
                                                        item[field.name] = e.target.checked;
                                                    })
                                                    props.changeData(newData);
                                                }}
                                            />
                                        </Tooltip>
                                    : null}
                                    {field.sorted ? <TableSortLabel
                                        active={field.name === orderBy}
                                        direction={order}
                                        onClick={e => {
                                            const isAsc = orderBy === field.name && order === 'asc';
                                            setOrder(isAsc ? 'desc' : 'asc');
                                            setOrderBy(field.name);
                                        }}
                                    >{I18n.t(field.title)}</TableSortLabel> : I18n.t(field.title)}
                                </TableCell>
                            })}
                            <TableCell>
                                <Tooltip title={I18n.t('Delete all')}>
                                    <IconButton size="small" 
                                        onClick={e => setDeleteAllDialog({
                                            open: true,
                                            action: () => props.changeData([]),
                                        })}
                                        disabled={!props.data.length}
                                    >
                                        <DeleteIcon/>
                                    </IconButton>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {
                            sortedData.map((sortedItem) =>
                                <TableRow hover key={sortedItem.$index}>
                                    {props.fields.map(field =>
                                        <DataCell sortedItem={sortedItem} field={field} editMode={editMode} setEditMode={setEditMode} key={field.name} {...props} />
                                    )}
                                    <TableCell>
                                        <Tooltip title={I18n.t('Delete')}>
                                            <IconButton size="small" onClick={e => {
                                                let lastTime = window.sessionStorage.getItem('disableDeleteDialogs');
                                                if (lastTime && (new Date() - new Date(lastTime)) < 1000 * 60 * 5) {
                                                    props.deleteItem(sortedItem.$index);
                                                    return;
                                                }
                                                setDeleteDialog({
                                                    open: true,
                                                    action: (disableDialogs) => {
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
                classes={props.classes}
            />
            <DeleteAllDialog
                open={deleteAllDialog.open}
                action={deleteAllDialog.action}
                onClose={() => setDeleteAllDialog({
                    open: false,
                    action: null,
                })}
                classes={props.classes}
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
                classes={props.classes}
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
}

export default withStyles(styles)(RegisterTable);