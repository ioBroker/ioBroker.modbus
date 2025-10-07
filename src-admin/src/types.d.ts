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
}
