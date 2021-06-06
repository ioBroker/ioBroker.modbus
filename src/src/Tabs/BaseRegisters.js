import React, {Component} from 'react';
import PropTypes from 'prop-types';

import RegisterTable from '../Components/RegisterTable';

class BaseRegisters extends Component {

    nativeField = ''

    getFields() {
        return [];
    }
    
    changeParam = (index, name, value) => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        data[index][name] = value;
        this.props.onChange(this.nativeField, data);
    }

    addItem = () => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        let newItem = {}
        this.getFields().forEach(field => newItem[field.name] = '')
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    }

    deleteItem = (index) => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        data.splice(index, 1);
        this.props.onChange(this.nativeField, data);
    }

    changeData = (data) => {
        this.props.onChange(this.nativeField, data);
    }

    render() {
        return <RegisterTable
            classes={this.props.classes}
            fields={this.getFields()}
            data={this.props.native[this.nativeField]}
            changeParam={this.changeParam}
            addItem={this.addItem}
            deleteItem={this.deleteItem}
            changeData={this.changeData}
        />
    }
}

BaseRegisters.propTypes = {
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

export default BaseRegisters;
