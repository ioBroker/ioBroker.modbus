import PropTypes from 'prop-types';

import types from '../data/types';
import roles from '../data/roles';

import BaseRegisters from './BaseRegisters';

class InputRegisters extends BaseRegisters {
    nativeField = 'inputRegs';

    getFields() {
        let result = [
            {name: '_address', title: 'Address', type: 'number', sorted: true, width: 20},
            {name: 'name', title: 'Name', type: 'text', sorted: true},
            {name: 'description', title: 'Description', type: 'text', sorted: true},
            {name: 'unit', title: 'Unit', type: 'text', width: 30},
            {name: 'type', title: 'Type', type: 'select', options: types, sorted: true},
            {name: 'len', title: 'Length', type: 'text', width: 20},
            {name: 'factor', title: 'Factor', type: 'text', width: 20, expert: true},
            {name: 'offset', title: 'Offset', type: 'text', width: 20},
            {name: 'formula', title: 'Formula', type: 'text'},
            {name: 'role', title: 'Role', type: 'select', options: roles, sorted: true},
            {name: 'cw', title: 'CW', type: 'checkbox', tooltip: 'Cyclic write'},
            {name: 'isScale', title: 'SF', type: 'checkbox', tooltip: 'Store this value as scaling factor', expert: true},
        ]

        if (this.props.native.params.multiDeviceId) {
            result.splice(1, 0,
                {name: 'deviceId', title: 'Slave ID', type: 'number', sorted: true, width: 20},
            );
        }

        return result;
    }

    addItem = () => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        let newItem = {}
        this.getFields().forEach(field => newItem[field.name] = '')
        if (data.length) {
            let sortedData = JSON.parse(JSON.stringify(data));
            sortedData.sort((item1, item2) => item1._address > item2._address ? 1 : -1);
            let lastItem = sortedData[sortedData.length - 1];
            newItem._address = parseInt(lastItem._address) + (lastItem.len ? parseInt(lastItem.len) : 1);
            newItem.deviceId = lastItem.deviceId;
            newItem.type = lastItem.type;
            newItem.len = lastItem.len;
            newItem.factor = lastItem.factor;
            newItem.offset = lastItem.offset;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        } else {
            newItem.role = 'level';
            newItem.factor = 1;
            newItem.offset = 0;
            newItem._address = this.props.native.params.showAliases ? 30001 : 0;
        }
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    }

    getDisable = (index, name) => {
        if (name === 'len') {
            if (!['string', 'stringle'].includes(this.props.native[this.nativeField][index].type)) {
                return true;
            }
        }
        return false;
    }

    changeParam = (index, name, value) => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        data[index][name] = value;
        if (name === 'type') {
            if (['', 'uint16be', 'uint16le', 'int16be', 'int16le', 'uint8be', 'uint8le', 'int8be', 'int8le'].includes(value)) {
                data[index].len = 1;
            }
            if (['uint32be', 'uint32le', 'uint32sw', 'uint32sb', 'int32be', 'int32le', 'int32sw', 'int32sb', 'floatbe', 'floatle', 'floatsw', 'floatsb', 'string', 'stringle'].includes(value)) {
                data[index].len = 2;
            }
            if (['uint64be', 'uint64le', 'doublebe', 'doublele'].includes(value)) {
                data[index].len = 4;
            }
        }
        this.props.onChange(this.nativeField, data);
    }
}

InputRegisters.propTypes = {
    common: PropTypes.object.isRequired,
    native: PropTypes.object.isRequired,
    instance: PropTypes.number.isRequired,
    adapterName: PropTypes.string.isRequired,
    onError: PropTypes.func,
    onLoad: PropTypes.func,
    onChange: PropTypes.func,
    changed: PropTypes.bool,
    socket: PropTypes.object.isRequired,
};

export default InputRegisters;
