import React from 'react';
import PropTypes from 'prop-types';

import types from '../data/types';
import roles from '../data/roles';

import BaseRegisters from './BaseRegisters';

class InputRegisters extends BaseRegisters {
    nativeField = 'inputRegs'

    getFields() {
        let result = [
            {name: '_address', title: 'Address', type: 'text'},
            {name: 'name', title: 'Name', type: 'text'},
            {name: 'description', title: 'Description', type: 'text'},
            {name: 'unit', title: 'Unit', type: 'text'},
            {name: 'type', title: 'Type', type: 'select', options: types},
            {name: 'len', title: 'Length', type: 'text'},
            {name: 'factor', title: 'Factor', type: 'text'},
            {name: 'offset', title: 'Offset', type: 'text'},
            {name: 'formula', title: 'formula', type: 'text'},
            {name: 'role', title: 'Role', type: 'select', options: roles},
            {name: 'cw', title: 'CW', type: 'checkbox'},
            {name: 'isScale', title: 'SF', type: 'checkbox'},
        ]

        if (this.props.native.params.multiDeviceId) {
            result.splice(1, 0, 
                {name: 'deviceId', title: 'Slave ID', type: 'text'},
            );
        }

        return result;
    }

    addItem = () => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        let newItem = {}
        this.getFields().forEach(field => newItem[field.name] = '')
        if (data.length) {
            let lastItem = data[data.length - 1];
            newItem._address = parseInt(lastItem._address) + 1;
            newItem.deviceId = lastItem.deviceId;
            newItem.type = lastItem.type;
            newItem.len = lastItem.len;
            newItem.factor = lastItem.factor;
            newItem.offset = lastItem.offset;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        }
        data.push(newItem);
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
