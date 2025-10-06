import roles from '../data/roles.json';
import { parseAddress } from '../Components/Utils';

import BaseRegisters from './BaseRegisters';
import type { Register, RegisterField, RegisterType } from '../types';

const rolesTyped: { value: string; title: string }[] = roles;

export default class DiscreteInputs extends BaseRegisters {
    nativeField: RegisterType = 'disInputs';
    nativeFieldName: 'inputRegisters' | 'holdingRegisters' | 'coils' | 'discreteInputs' = 'discreteInputs';
    offsetName: 'inputRegsOffset' | 'holdingRegsOffset' | 'coilsOffset' | 'disInputsOffset' = 'disInputsOffset';

    getFields(): RegisterField[] {
        const result: RegisterField[] = [
            { name: '_address', title: 'Address', type: 'text', sorted: true, width: 20 },
            { name: 'name', title: 'Name', type: 'text', sorted: true },
            { name: 'description', title: 'Description', type: 'text', sorted: true },
            { name: 'formula', title: 'Formula', type: 'text', expert: true, formulaDisabled: true },
            { name: 'role', title: 'Role', type: 'select', options: rolesTyped, sorted: true },
            { name: 'room', title: 'Room', type: 'rooms' },
            { name: 'cw', title: 'CW', type: 'checkbox', tooltip: 'Cyclic write' },
            {
                name: 'isScale',
                title: 'SF',
                type: 'checkbox',
                tooltip: 'Store this value as scaling factor',
                expert: true,
                formulaDisabled: true,
            },
        ];

        if (this.props.native.params.multiDeviceId) {
            result.splice(1, 0, { name: 'deviceId', title: 'Slave ID', type: 'number', sorted: true, width: 20 });
        }

        return result;
    }

    isShowExtendedModeSwitch(): boolean {
        return this.props.native.params.slave !== '1';
    }

    addItem = (): void => {
        const data: Register[] = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        const newItem: Register = {
            _address: '',
            address: 0,
            name: '',
            description: '',
            formula: '',
            role: '',
            cw: false,
            isScale: false,
        } as Register;

        if (data.length) {
            const sortedData = this.getSortedData();
            const lastItem = sortedData[sortedData.length - 1].item;
            newItem._address = parseAddress(lastItem._address) + 1;
            while (sortedData.find(item => parseAddress(item.item._address) === newItem._address)) {
                newItem._address++;
            }
            newItem.deviceId = lastItem.deviceId;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        } else {
            newItem.role = 'level';
            newItem._address = this.props.native.params.showAliases ? 10001 : 0;
        }
        newItem.address = this.addressToCanonical(newItem._address);
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    };
}
