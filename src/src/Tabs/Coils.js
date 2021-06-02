import React, {Component} from 'react';
import PropTypes from 'prop-types';

import RegisterTable from '../Components/RegisterTable';

class Coils extends Component {
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
        {name: 'role', title: 'Role', type: 'text'},
        {name: 'room', title: 'Room', type: 'text'},
        {name: 'poll', title: 'Poll', type: 'checkbox'},
        {name: 'wp', title: 'WP', type: 'checkbox'},
        {name: 'cw', title: 'CW', type: 'checkbox'},
        {name: 'isScale', title: 'SF', type: 'checkbox'},
    ]
    render() {
        return <RegisterTable
            classes={this.props.classes}
            fields={this.fields}
            data={this.props.native.coils}
        />
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
