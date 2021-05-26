import React, {Component} from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

import TextField from '@material-ui/core/TextField';

import I18n from '@iobroker/adapter-react/i18n';

class Options extends Component {
    constructor(props) {
        super(props);

        this.state = {
        };
    }
    render() {
        return <form className={ this.props.classes.tab }>
            <div className={clsx(this.props.classes.column, this.props.classes.columnSettings) }>
                <div><TextField value={this.props.native.params.type}/></div>
            </div>
        </form>;
    }
}

Options.propTypes = {
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

export default Options;
