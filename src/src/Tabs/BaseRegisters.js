import {Component} from 'react';
import PropTypes from 'prop-types';

import I18n from '@iobroker/adapter-react/i18n';

import RegisterTable from '../Components/RegisterTable';
import Paper from '@material-ui/core/Paper';

class BaseRegisters extends Component {

    nativeField = ''

    getRooms() {
        return this.props.rooms.map(room => ({
            value: room._id,
            title: typeof room.common.name === 'object' ? room.common.name[I18n.lang] : room.common.name
        }));
    }

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

    getDisable = (index, name) => {
        return false;
    }

    render() {
        return <Paper>
            <RegisterTable
                fields={this.getFields()}
                data={this.props.native[this.nativeField]}
                changeParam={this.changeParam}
                addItem={this.addItem}
                deleteItem={this.deleteItem}
                changeData={this.changeData}
                getDisable={this.getDisable}
            />
        </Paper>
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
