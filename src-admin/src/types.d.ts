import type { Modbus } from '@iobroker/modbus';

export interface OptionField {
    name: keyof Modbus.ModbusParametersTyped;
    type: 'checkbox' | 'text' | 'number' | 'select' | 'ports' | 'cert';
    dimension?: string;
    help?: string;
    tooltip?: string;
    title: string;
    options?: { value: string; title: string }[];
    min?: number;
    max?: number;
}

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
