import {Component} from 'react';
import PropTypes from 'prop-types';

import Paper from '@mui/material/Paper';

import RegisterTable from '../Components/RegisterTable';
import Utils from '../Components/Utils';

class BaseRegisters extends Component {
    constructor(props) {
        super(props);
        this.nativeField = '';
        this.state = {
            order: window.localStorage.getItem('Modbus.order') || 'asc',
            orderBy: window.localStorage.getItem('Modbus.orderBy') || '_address',
        };
    }

    componentDidMount() {
        if (!window.localStorage.getItem('Modbus.orderBy')) {
            this.fields = this.fields || this.getFields();
            const isSlaveIDPresent = !!this.fields.find(item => item.name === 'deviceId');
            const orderBy = isSlaveIDPresent ? 'deviceId' : '_address';

            if (orderBy !== this.state.orderBy) {
                this.setState({orderBy});
            }
        }
    }

    isShowExtendedModeSwitch() {
        return true;
    }

    getFields() {
        return null;
    }

    addressToCanonical(_address) {
        let address = _address;
        let params = this.props.native.params;
        if (params.showAliases) {
            if (params.directAddresses) {
                address = Utils.direct2nonDirect(this.nativeField, address);
            }
            address = Utils.alias2address(this.nativeField, address);
        }
        return address;
    }

    changeParam = (index, name, value) => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        data[index][name] = value;
        if (name === '_address') {
            data[index]['address'] = this.addressToCanonical(value);
        }
        this.props.onChange(this.nativeField, data);
    }

    addItem = () => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        let newItem = {};
        this.getFields().forEach(field => newItem[field.name] = '');
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    }

    deleteItem = index => {
        let data = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        data.splice(index, 1);
        this.props.onChange(this.nativeField, data);
    }

    changeData = data => {
        this.props.onChange(this.nativeField, data);
    }

    getDisable = (index, name) => {
        return false;
    }

    getSortedData = (data, orderBy, order) => {
        data = data || this.props.native[this.nativeField];
        orderBy = orderBy || this.state.orderBy;
        order = order || this.state.order;
        let sortedData = [];
        data.forEach((item, index) => {sortedData[index] = {item, $index: index}});
        const field = this.fields.find(item => item.name === orderBy);

        sortedData.sort((sortedItem1, sortedItem2) => {
            let sort1;
            let sort2;
            if (orderBy === 'deviceId') {
                sort1 = (parseInt(sortedItem1.item.deviceId, 10) << 16) | parseInt(sortedItem1.item._address, 10);
                sort2 = (parseInt(sortedItem2.item.deviceId, 10) << 16) | parseInt(sortedItem2.item._address, 10);
            } else if (orderBy === '$index') {
                sort1 = sortedItem1[orderBy];
                sort2 = sortedItem2[orderBy];
            } else if (field && field.type === 'number') {
                sort1 = parseInt(sortedItem1.item[orderBy], 10);
                sort2 = parseInt(sortedItem2.item[orderBy], 10);
            } else {
                sort1 = sortedItem1.item[orderBy];
                sort2 = sortedItem2.item[orderBy];
            }
            return (order === 'asc' ? sort1 > sort2 : sort1 < sort2) ? 1 : -1;
        });

        return sortedData;
    }

    render() {
        this.fields = this.fields || this.getFields();

        return <Paper>
            <RegisterTable
                fields={this.fields}
                data={this.props.native[this.nativeField]}
                getSortedData={this.getSortedData}
                showExtendedModeSwitch={this.isShowExtendedModeSwitch()}
                changeParam={this.changeParam}
                addItem={this.addItem}
                deleteItem={this.deleteItem}
                changeData={this.changeData}
                getDisable={this.getDisable}
                formulaDisabled={this.props.formulaDisabled}
                rooms={this.props.rooms}
                order={this.state.order}
                orderBy={this.state.orderBy}
                onChangeOrder={(orderBy, order) => {
                    this.setState({orderBy, order});
                    window.localStorage.setItem('Modbus.orderBy', orderBy);
                    window.localStorage.setItem('Modbus.order', order);
                }}
            />
        </Paper>;
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
    rooms: PropTypes.object,
    formulaDisabled: PropTypes.bool,
};

export default BaseRegisters;
