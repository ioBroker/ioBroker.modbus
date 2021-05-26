import React, {Component} from 'react';
import PropTypes from 'prop-types';
import clsx from 'clsx';

import Grid from '@material-ui/core/Grid';

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
                <Grid container spacing={2}>
                    <Grid item xs>Address</Grid>
                    <Grid item xs>Name</Grid>
                    <Grid item xs>Description</Grid>
                    <Grid item xs>formula</Grid>
                    <Grid item xs>Role</Grid>
                    <Grid item xs>CW</Grid>
                    <Grid item xs>SF</Grid>
                </Grid>
                {
                    this.props.native.disInputs.map((item, index) => 
                        <Grid container key={index} spacing={2}>
                            <Grid xs item>{item._address}</Grid>
                            <Grid xs item>{item.name}</Grid>
                            <Grid xs item>{item.description}</Grid>
                            <Grid xs item>{item.formula}</Grid>
                            <Grid xs item>{item.role}</Grid>
                            <Grid xs item>{item.cw}</Grid>
                            <Grid xs item>{item.sf}</Grid>
                        </Grid>
                    )
                }
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
