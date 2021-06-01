import clsx from 'clsx';

import Grid from '@material-ui/core/Grid';
import Checkbox from '@material-ui/core/Checkbox';

const RegisterTable = props => {
    return <form className={ props.classes.tab }>
            <div className={clsx(props.classes.column, props.classes.columnSettings) }>
                <Grid container spacing={2}>
                    {props.fields.map(field => 
                        <Grid key={field.name} item xs>{field.title}</Grid>
                    )}
                </Grid>
                {
                    props.data.map((item, index) => 
                        <Grid container key={index} spacing={2}>
                            {props.fields.map(field => 
                                <Grid key={field.name} item xs>{
                                    (() => {
                                        if (field.type === 'checkbox') {
                                            return <Checkbox checked={!!item[field.name]}/>
                                        }
                                        return item[field.name]
                                    })()
                                }</Grid>
                            )}
                        </Grid>
                    )
                }
            </div>
        </form>;
}

export default RegisterTable