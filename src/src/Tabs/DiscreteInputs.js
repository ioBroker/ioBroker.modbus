import React, {Component} from 'react';
import PropTypes from 'prop-types';

import roles from '../data/roles';

import RegisterTable from '../Components/RegisterTable';

class DiscreteInputs extends Component {
    constructor(props) {
        super(props);

        this.state = {
        };
    }
    fields = [
        {name: '_address', title: 'Address', type: 'text'},
        {name: 'name', title: 'Name', type: 'text'},
        {name: 'description', title: 'Description', type: 'text'},
        {name: 'formula', title: 'formula', type: 'text'},
        {name: 'role', title: 'Role', type: 'select', options: roles},
        {name: 'cw', title: 'CW', type: 'checkbox'},
        {name: 'isScale', title: 'SF', type: 'checkbox'},
    ]
    render() {
        return <RegisterTable
            classes={this.props.classes}
            fields={this.fields}
            data={this.props.native.disInputs}
        />
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
};

export default DiscreteInputs;
