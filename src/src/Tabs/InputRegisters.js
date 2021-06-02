import React, {Component} from 'react';
import PropTypes from 'prop-types';

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
        {name: 'type', title: 'Type', type: 'select', options: [
            {value: '', title: ''},
            {value: 'uint16be', title: 'Unsigned 16 bit (Big Endian)'},
            {value: 'uint16le', title: 'Unsigned 16 bit (Little Endian)'},
            {value: 'int16be', title: 'Signed 16 bit (Big Endian)'},
            {value: 'int16le', title: 'Signed 16 bit (Little Endian)'},
            {value: 'uint32be', title: 'Unsigned 32 bit (Big Endian)'},
            {value: 'uint32le', title: 'Unsigned 32 bit (Little Endian)'},
            {value: 'uint32sw', title: 'Unsigned 32 bit (Big Endian Word Swap)'},
            {value: 'uint32sb', title: 'Unsigned 32 bit (Big Endian Byte Swap)'},
            {value: 'int32be', title: 'Signed 32 bit (Big Endian)'},
            {value: 'int32le', title: 'Signed 32 bit (Little Endian)'},
            {value: 'int32sw', title: 'Signed 32 bit (Big Endian Word Swap)'},
            {value: 'int32sb', title: 'Signed 32 bit (Big Endian Byte Swap)'},
            {value: 'uint64be', title: 'Unsigned 64 bit (Big Endian)'},
            {value: 'uint64le', title: 'Unsigned 64 bit (Little Endian)'},
            {value: 'uint8be', title: 'Unsigned 8 bit (Big Endian)'},
            {value: 'uint8le', title: 'Unsigned 8 bit (Little Endian)'},
            {value: 'int8be', title: 'Signed 8 bit (Big Endian)'},
            {value: 'int8le', title: 'Signed 8 bit (Little Endian)'},
            // {value: 'int64be', title: 'Signed 64 bit (Big Endian)'},
            // {value: 'int64le', title: 'Signed 64 bit (Little Endian)'},
            {value: 'floatbe', title: 'Float (Big Endian)'},
            {value: 'floatle', title: 'Float (Little Endian)'},
            {value: 'floatsw', title: 'Float (Big Endian Word Swap)'},
            {value: 'floatsb', title: 'Float (Big Endian Byte Swap)'},
            {value: 'doublebe', title: 'Double (Big Endian)'},
            {value: 'doublele', title: 'Double (Little Endian)'},
            {value: 'string', title: 'String (Zero-end)'},
            {value: 'stringle', title: 'String (Little Endian, Zero-end)'}
        ]
        },
        {name: 'len', title: 'Length', type: 'text'},
        {name: 'factor', title: 'Factor', type: 'text'},
        {name: 'offset', title: 'Offset', type: 'text'},
        {name: 'formula', title: 'formula', type: 'text'},
        {name: 'role', title: 'Role', type: 'select', options: [
            {value: '', title: ''},
            {value: 'value', title: 'value'},
            {value: 'level', title: 'level'},
            {value: 'state', title: 'state'},
            {value: 'switch', title: 'switch'},
            {value: 'value.temperature', title: 'value.temperature'},
            {value: 'value.humidity', title: 'value.humidity'},
            {value: 'value.brightness', title: 'value.brightness'},
            {value: 'value.uv', 		title: 'value.uv'},
            {value: 'value.pressure', title: 'value.pressure'},
            {value: 'value.battery', title: 'value.battery'},
            {value: 'value.valve', title: 'value.valve'},
            {value: 'value.time', title: 'value.time'},
            {value: 'value.interval', title: 'value.interval'},
            {value: 'value.window', 	title: 'value.window'},
            {value: 'button', title: 'button'},
            {value: 'indicator', title: 'indicator'},
            {value: 'level.dimmer', title: 'level.dimmer'},
            {value: 'level.valve', title: 'level.valve'},
            {value: 'level.blind', title: 'level.blind'},
            {value: 'level.temperature', title: 'level.temperature'},
            {value: 'level.interval', title: 'level.interval'}
        ]
        },
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
