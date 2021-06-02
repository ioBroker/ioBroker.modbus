import React, {Component} from 'react';
import PropTypes from 'prop-types';

import types from '../data/types';
import roles from '../data/roles';

import RegisterTable from '../Components/RegisterTable';

class InputRegisters extends Component {
    constructor(props) {
        super(props);

        this.state = {
        };
    }
    fields = [
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
    
    changeParam = (index, name, value) => {
        let data = JSON.parse(JSON.stringify(this.props.native.inputRegs));
        data[index][name] = value;
        this.props.onChange('inputRegs', data);
    }

    addItem = () => {
        let data = JSON.parse(JSON.stringify(this.props.native.inputRegs));
        let newItem = {}
        this.fields.forEach(field => newItem[field.name] = null)
        if (data.length) {
            newItem._address = parseInt(data[data.length - 1]._address) + 1;
        }
        data.push(newItem);
        console.log(data);
        this.props.onChange('inputRegs', data);
    }

    deleteItem = (index) => {
        let data = JSON.parse(JSON.stringify(this.props.native.inputRegs));
        data.splice(index, 1);
        console.log(data);
        this.props.onChange('inputRegs', data);
    }

    render() {
        return <RegisterTable
            classes={this.props.classes}
            fields={this.fields}
            data={this.props.native.inputRegs}
            changeParam={this.changeParam}
            addItem={this.addItem}
            deleteItem={this.deleteItem}
        />
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
