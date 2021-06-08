import { useState } from 'react';
import clsx from 'clsx';

import I18n from '@iobroker/adapter-react/i18n';

import TsvDialog from './TsvDialog';

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
import TableSortLabel from '@material-ui/core/TableSortLabel';
import Tooltip from '@material-ui/core/Tooltip';

import ClearIcon from '@material-ui/icons/Clear';
import AddIcon from '@material-ui/icons/Add';
import ImportExport from '@material-ui/icons/ImportExport';

const RegisterTable = props => {
    const [tsvDialogOpen, setTsvDialogOpen] = useState(false);
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('$index');
    
    let sortedData = []
    props.data.forEach((item, index) => {sortedData[index] = {item: item, $index: index}});
    sortedData.sort((sortedItem1, sortedItem2) => {
        if (orderBy === '$index') {
            return (order === 'asc' ? sortedItem1[orderBy] > sortedItem2[orderBy] : sortedItem1[orderBy] < sortedItem2[orderBy]) ? 1 : -1;            
        } else {
            return (order === 'asc' ? sortedItem1.item[orderBy] > sortedItem2.item[orderBy] : sortedItem1.item[orderBy] < sortedItem2.item[orderBy]) ? 1 : -1;            
        }
    });

    return <form className={ props.classes.tab }>
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
            </div>
            <div className={clsx(props.classes.column, props.classes.columnSettings) }>
                <Table size="small" 
                    stickyHeader
                    // padding="none"
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
                            <TableCell/>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {
                            sortedData.map((sortedItem) => 
                                <TableRow key={sortedItem.$index}>
                                    <TableCell>
                                        {sortedItem.$index}
                                    </TableCell>
                                    {props.fields.map(field => 
                                        <TableCell key={field.name} 
                                            // style={{padding: '0px 4px', border: 0}}
                                        >{
                                            (() => {
                                                let item = sortedItem.item;
                                                // return item[field.name];
                                                if (field.type === 'checkbox') {
                                                    return <Checkbox 
                                                        checked={!!item[field.name]}
                                                        className={props.classes.tableCheckbox}
                                                        onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.checked)}
                                                    />
                                                }
                                                if (field.type === 'select') {
                                                    return <Select
                                                        className={props.classes.tableSelect}
                                                        value={item[field.name]} 
                                                        onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
                                                    >
                                                        {field.options.map(option => 
                                                            <MenuItem key={option.value} value={option.value}>{option.title ? I18n.t(option.title) : <i>{I18n.t('Nothing')}</i>}</MenuItem>
                                                        )}
                                                    </Select>
                                                }
                                                return <Textfield value={item[field.name]} className={props.classes.tableTextfield}
                                                    onChange={e => props.changeParam(sortedItem.$index, field.name, e.target.value)}
                                                />
                                            })()
                                        }</TableCell>
                                    )}
                                    <TableCell>
                                        <Tooltip title={I18n.t('Delete')}>
                                            <IconButton onClick={e => props.deleteItem(sortedItem.$index)}>
                                                <ClearIcon/>
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
        </form>;
}

export default RegisterTable