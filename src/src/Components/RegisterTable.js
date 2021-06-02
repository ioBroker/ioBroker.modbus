import clsx from 'clsx';
import { tsv2json, json2tsv } from 'tsv-json';

import I18n from '@iobroker/adapter-react/i18n';

import Table from '@material-ui/core/Table';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Checkbox from '@material-ui/core/Checkbox';
import Textfield from '@material-ui/core/Textfield';
import IconButton from '@material-ui/core/IconButton';
import FormControl from '@material-ui/core/FormControl';
import InputLabel from '@material-ui/core/InputLabel';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';

import ClearIcon from '@material-ui/icons/Clear';
import AddIcon from '@material-ui/icons/Add';
import SaveIcon from '@material-ui/icons/Save';
import FolderOpenIcon from '@material-ui/icons/FolderOpen';

const RegisterTable = props => {
    const exportTsv = () => {
        let tsvResult = [];
        tsvResult.push(props.fields.map(field => field.name))
        props.data.forEach(item => tsvResult.push(Object.values(item).map(value => value.toString())))
        console.log(tsvResult)
        console.log(json2tsv(tsvResult))
    }

    const importTsv = () => {

    }

    return <form className={ props.classes.tab }>
            <div>
                <IconButton onClick={e => props.addItem()}>
                    <AddIcon/>
                </IconButton>
                <IconButton onClick={exportTsv}>
                    <SaveIcon/>
                </IconButton>
                <IconButton>
                    <FolderOpenIcon/>
                </IconButton>
            </div>
            <div className={clsx(props.classes.column, props.classes.columnSettings) }>
                <Table size="small">
                    <TableRow>
                        {props.fields.map(field => 
                            <TableCell key={field.name}><b>{I18n.t(field.title)}</b></TableCell>
                        )}
                        <TableCell/>
                    </TableRow>
                    {
                        props.data.map((item, index) => 
                            <TableRow key={index}>
                                {props.fields.map(field => 
                                    <TableCell key={field.name}>{
                                        (() => {
                                            if (field.type === 'checkbox') {
                                                return <Checkbox 
                                                    checked={!!item[field.name]}
                                                    onChange={e => props.changeParam(index, field.name, e.target.checked)}
                                                />
                                            }
                                            if (field.type === 'select') {
                                                return <FormControl>
                                                    <InputLabel>{I18n.t(field.title)}</InputLabel>
                                                    <Select
                                                        style={{width: 200}}
                                                        value={item[field.name]} 
                                                        onChange={e => props.changeParam(index, field.name, e.target.value)}
                                                    >
                                                        {field.options.map(option => 
                                                            <MenuItem key={option.value} value={option.value}>{I18n.t(option.title)}</MenuItem>
                                                        )}
                                                    </Select>
                                                </FormControl>
                                            }
                                            return <Textfield value={item[field.name]} style={{border: '0', width: '100%'}}
                                                onChange={e => props.changeParam(index, field.name, e.target.value)}
                                            />
                                        })()
                                    }</TableCell>
                                )}
                                <TableCell>
                                    <IconButton onClick={e => props.deleteItem(index)}>
                                        <ClearIcon/>
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        )
                    }
                </Table>
            </div>
        </form>;
}

export default RegisterTable