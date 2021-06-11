import PropTypes from 'prop-types';

import roles from '../data/roles';

import BaseRegisters from './BaseRegisters';

class DiscreteInputs extends BaseRegisters {
    nativeField = 'disInputs';

    getFields() {
        let result = [
            {name: '_address', title: 'Address', type: 'number', sorted: true, width: 20},
            {name: 'name', title: 'Name', type: 'text', sorted: true},
            {name: 'description', title: 'Description', type: 'text', sorted: true},
            {name: 'formula', title: 'Formula', type: 'text', expert: true},
            {name: 'role', title: 'Role', type: 'select', options: roles, sorted: true},
            {name: 'room', title: 'Room', type: 'rooms'},
            {name: 'cw', title: 'CW', type: 'checkbox', tooltip: 'Cyclic write'},
            {name: 'isScale', title: 'SF', type: 'checkbox', tooltip: 'Store this value as scaling factor', expert: true},
        ];

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
            newItem._address = parseInt(lastItem._address) + 1;
            newItem.deviceId = lastItem.deviceId;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        } else {
            newItem.role = 'level';
            newItem._address = this.props.native.params.showAliases ? 10001 : 0;
        }
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    }
}

DiscreteInputs.propTypes = {
    common: PropTypes.object.isRequired,
    native: PropTypes.object.isRequired,
    instance: PropTypes.number.isRequired,
    adapterName: PropTypes.string.isRequired,
    onError: PropTypes.func,
    onLoad: PropTypes.func,
    onChange: PropTypes.func,
    changed: PropTypes.bool,
    socket: PropTypes.object.isRequired,
    rooms: PropTypes.object,
};

export default DiscreteInputs;
