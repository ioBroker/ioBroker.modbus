import React, {Component} from 'react';
import {withStyles} from '@material-ui/core/styles';
import PropTypes from 'prop-types';
import clsx from 'clsx';

import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Snackbar from '@material-ui/core/Snackbar';
import IconButton from '@material-ui/core/IconButton';

import {MdClose as IconClose} from 'react-icons/md';

import I18n from '@iobroker/adapter-react/i18n';
import Logo from '@iobroker/adapter-react/Components/Logo';

const styles = theme => ({
    tab: {
        width: '100%',
        minHeight: '100%'
    },
    column: {
        display: 'inline-block',
        verticalAlign: 'top',
        marginRight: 20
    },
    columnSettings: {
        width: 'calc(100% - 370px)',
    },
});

class Options extends Component {
    constructor(props) {
        super(props);

        this.state = {
            toast: '',
        };
    }


    renderToast() {
        if (!this.state.toast) {
            return null;
        }
        return <Snackbar
            anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
            }}
            open={true}
            autoHideDuration={6000}
            onClose={() => this.setState({toast: ''})}
            ContentProps={{
                'aria-describedby': 'message-id',
            }}
            message={<span id="message-id">{this.state.toast}</span>}
            action={[
                <IconButton
                    key="close"
                    aria-label="Close"
                    color="inherit"
                    className={this.props.classes.close}
                    onClick={() => this.setState({toast: ''})}
                >
                    <IconClose />
                </IconButton>,
            ]}
        />;
    }

    renderCheckbox(title, attr, style) {
        return <FormControlLabel key={attr} style={Object.assign({paddingTop: 5}, style)} className={this.props.classes.controlElement}
              control={
                  <Checkbox
                      checked={this.props.native[attr]}
                      onChange={() => this.props.onChange(attr, !this.props.native[attr])}
                      color="primary"
                  />
              }
              label={I18n.t(title)}
        />;
    }

    render() {
        return <form className={ this.props.classes.tab }>
            {/* <Logo
                classes={{}}
                instance={ this.props.instance }
                common={ this.props.common }
                native={ this.props.native }
                onError={ text => this.setState({errorText: text}) }
                onLoad={ this.props.onLoad }
            /> */}
            <div className={clsx(this.props.classes.column, this.props.classes.columnSettings) }>
                Place your code here
            </div>
            { this.renderToast() }
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

export default withStyles(styles)(Options);
