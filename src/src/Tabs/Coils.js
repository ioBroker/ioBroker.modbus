import PropTypes from 'prop-types';

import roles from '../data/roles';

import BaseRegisters from './BaseRegisters';

class Coils extends BaseRegisters {
    nativeField = 'coils'

    getFields() { 
        let rooms = this.getRooms();
        rooms.unshift({value: '', title: ''});

        let result = [
            {name: '_address', title: 'Address', type: 'number', sorted: true, width: 20},
            {name: 'name', title: 'Name', type: 'text', sorted: true},
            {name: 'description', title: 'Description', type: 'text', sorted: true},
            {name: 'formula', title: 'formula', type: 'text'},
            {name: 'role', title: 'Role', type: 'select', options: roles, sorted: true},
            {name: 'room', title: 'Room', type: 'select', options: rooms, sorted: true},
            {name: 'poll', title: 'Poll', type: 'checkbox'},
            {name: 'wp', title: 'WP', type: 'checkbox'},
            {name: 'cw', title: 'CW', type: 'checkbox'},
            {name: 'isScale', title: 'SF', type: 'checkbox'},
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
            newItem._address = parseInt(lastItem._address) + 1;
            newItem.deviceId = lastItem.deviceId;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.poll = lastItem.poll;
            newItem.wp = lastItem.wp;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        } else {
            newItem.role = 'level';
        }
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    }
}

Coils.propTypes = {
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

export default Coils;
