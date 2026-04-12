import type { Modbus } from '@iobroker/modbus';

export interface RegisterField {
    name: keyof Modbus.Register;
    title: string;
    type: string;
    width?: number | string;
    expert?: boolean;
    formulaDisabled?: boolean;
    sorted?: boolean;
    tooltip?: string;
    options?: Array<{ value: string; title: string }>;
    /** If true, this field belongs to the sanitization group and is toggled separately */
    sanitize?: boolean;
}
