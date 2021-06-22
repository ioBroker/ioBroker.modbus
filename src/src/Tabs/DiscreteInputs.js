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
            {name: 'formula', title: 'Formula', type: 'text', expert: true, formulaDisabled: true},
            {name: 'role', title: 'Role', type: 'select', options: roles, sorted: true},
            {name: 'room', title: 'Room', type: 'rooms'},
            {name: 'cw', title: 'CW', type: 'checkbox', tooltip: 'Cyclic write'},
            {name: 'isScale', title: 'SF', type: 'checkbox', tooltip: 'Store this value as scaling factor', expert: true, formulaDisabled: true},
        ];

        if (this.props.native.params.multiDeviceId) {
            result.splice(1, 0,
                {name: 'deviceId', title: 'Slave ID', type: 'number', sorted: true, width: 20},
            );
        }

        return result;
    }

    isShowExtendedModeSwitch() {
        return this.props.native.params.slave !== 1 && this.props.native.params.slave !== '1';
    }

    addItem = () => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        let newItem = {}
        this.getFields().forEach(field => newItem[field.name] = '')
        if (data.length) {
            let sortedData = this.getSortedData();
            let lastItem = sortedData[sortedData.length - 1].item;
            newItem._address = parseInt(lastItem._address, 10) + 1;
            while(sortedData.find(item => item.item._address === newItem._address)) {
                newItem._address++;
            }
            newItem.deviceId = lastItem.deviceId;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        } else {
            newItem.role = 'level';
            newItem._address = this.props.native.params.showAliases ? 10001 : 0;
        }
        newItem.address = this.addressToCanonical(newItem._address);
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
