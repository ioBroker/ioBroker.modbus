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
    
    let sortedData = JSON.parse(JSON.stringify(props.data));
    sortedData.forEach((item, index) => {item.$index = index});
    sortedData.sort((item1, item2) => (order === 'asc' ? item1[orderBy] > item2[orderBy] : item1[orderBy] < item2[orderBy]) ? 1 : -1);

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
                    // padding="none"
                >
                    <TableHead>
                        <TableRow>
                            <TableCell>
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
                                <TableCell key={field.name}>
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
                            sortedData.map((item) => 
                                <TableRow key={item.$index}>
                                    <TableCell>
                                        {item.$index}
                                    </TableCell>
                                    {props.fields.map(field => 
                                        <TableCell key={field.name} 
                                            // style={{padding: '0px 4px', border: 0}}
                                        >{
                                            (() => {
                                                // return item[field.name];
                                                if (field.type === 'checkbox') {
                                                    return <Checkbox 
                                                        checked={!!item[field.name]}
                                                        onChange={e => props.changeParam(item.$index, field.name, e.target.checked)}
                                                    />
                                                }
                                                if (field.type === 'select') {
                                                    return <Select
                                                        style={{width: 200}}
                                                        value={item[field.name]} 
                                                        onChange={e => props.changeParam(item.$index, field.name, e.target.value)}
                                                    >
                                                        {field.options.map(option => 
                                                            <MenuItem key={option.value} value={option.value}>{option.title ? I18n.t(option.title) : <i>{I18n.t('Nothing')}</i>}</MenuItem>
                                                        )}
                                                    </Select>
                                                }
                                                return <Textfield value={item[field.name]} style={{border: '0', width: '100%'}}
                                                    onChange={e => props.changeParam(item.$index, field.name, e.target.value)}
                                                />
                                            })()
                                        }</TableCell>
                                    )}
                                    <TableCell>
                                        <Tooltip title={I18n.t('Delete')}>
                                            <IconButton onClick={e => props.deleteItem(item.$index)}>
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
            <TsvDialog open={tsvDialogOpen} save={props.changeData} onClose={() => setTsvDialogOpen(false)} data={props.data} fields={props.fields}/>
        </form>;
}

export default RegisterTable