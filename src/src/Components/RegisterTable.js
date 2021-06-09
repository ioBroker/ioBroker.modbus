import { useState, useRef } from 'react';
import PropTypes from 'prop-types';

import I18n from '@iobroker/adapter-react/i18n';

import TsvDialog from './TsvDialog';
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
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
            >
                {field.options.map(option => 
                    <MenuItem key={option.value} value={option.value}>{option.title ? I18n.t(option.title) : <i>{I18n.t('Nothing')}</i>}</MenuItem>
                )}
            </Select>
        }
    } else {
        if (!editMode) {
            result = item[field.name] ? item[field.name] : null;
        } else {
            result = <Textfield value={item[field.name]}
                inputProps={{ref: ref, className: props.classes.tableTextfield}}
                type={field.type}
                onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
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
    const [orderBy, setOrderBy] = useState('$index');
    const [editMode, setEditMode] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState({
        open: false,
        actionTitle: '',
        action: null,
        title: '',
        text: ''
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
            <div>
                <Table size="small" 
                    stickyHeader
                    padding="none"
                >
                    <TableHead>
                        <TableRow>
                            <TableCell className={props.classes.tableHeader}>
                                <TableSortLabel 
                                    active={orderBy === '$index'} 
                                    direction={order}
                                    onClick={e => {
                                        const isAsc = orderBy === '$index' && order === 'asc';
                                        setOrder(isAsc ? 'desc' : 'asc');
                                        setOrderBy('$index');
                                    }}
                                >{I18n.t('Index')}</TableSortLabel>
                            </TableCell>
                            {props.fields.map(field => 
                                <TableCell key={field.name} className={props.classes.tableHeader}>
                                    {field.type === 'checkbox' ? 
                                        <Tooltip title={I18n.t('Change all')}>
                                            <Checkbox 
                                                checked={(() => {
                                                    let isChecked = false;
                                                    for (let k in props.data) {
                                                        if (props.data[k][field.name]) {
                                                            isChecked = true;
                                                        } else {
                                                            isChecked = false;
                                                            break;
                                                        }
                                                    }
                                                    return isChecked;
                                                })()}
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
                                    <TableSortLabel 
                                        active={field.name === orderBy} 
                                        direction={order}
                                        onClick={e => {
                                            const isAsc = orderBy === field.name && order === 'asc';
                                            setOrder(isAsc ? 'desc' : 'asc');
                                            setOrderBy(field.name);
                                        }}
                                    >{I18n.t(field.title)}</TableSortLabel>
                                </TableCell>
                            )}
                            <TableCell>
                                <Tooltip title={I18n.t('Delete all')}>
                                    <IconButton onClick={e => setDeleteDialog({
                                        open: true,
                                        actionTitle: 'Delete all items',
                                        action: () => props.changeData([]),
                                        title: 'Delete item',
                                        text: `Are you sure to delete all items?`
                                    })}>
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
                                    <TableCell className={props.classes.tableCell}>
                                        {sortedItem.$index}
                                    </TableCell>
                                    {props.fields.map(field => 
                                        <DataCell sortedItem={sortedItem} field={field} editMode={editMode} setEditMode={setEditMode} key={field.name} {...props} />
                                    )}
                                    <TableCell>
                                        <Tooltip title={I18n.t('Delete')}>
                                            <IconButton onClick={e => setDeleteDialog({
                                                open: true,
                                                actionTitle: 'Delete',
                                                action: () => props.deleteItem(sortedItem.$index),
                                                title: 'Delete item',
                                                text: `Are you sure to delete ${sortedItem.$index}?`
                                            })}>
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
            <DeleteDialog 
                open={deleteDialog.open} 
                action={deleteDialog.action} 
                actionTitle={deleteDialog.actionTitle} 
                onClose={() => setDeleteDialog({
                    open: false,
                    actionTitle: '',
                    action: null,
                    title: '',
                    text: ''
                })} 
                title={deleteDialog.title} 
                text={deleteDialog.text}
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
    deleteItem: PropTypes.func
}

export default RegisterTable