import types from '../data/types.json';
import roles from '../data/roles.json';
import { parseAddress } from '../Components/Utils';

import BaseRegisters from './BaseRegisters';
import type { Register, RegisterEntryType, RegisterField, RegisterType } from '../types';

export default class InputRegisters extends BaseRegisters {
    nativeField: RegisterType = 'inputRegs';

    getFields(): RegisterField[] {
        const result: RegisterField[] = [
            { name: '_address', title: 'Address', type: 'text', sorted: true, width: 20 },
            { name: 'name', title: 'Name', type: 'text', sorted: true },
            { name: 'description', title: 'Description', type: 'text', sorted: true },
            { name: 'unit', title: 'Unit', type: 'text', width: 30 },
            { name: 'type', title: 'Type', type: 'select', options: types, sorted: true },
            { name: 'len', title: 'Length', type: 'text', width: 20 },
            { name: 'factor', title: 'Factor', type: 'text', width: 20, expert: true },
            { name: 'offset', title: 'Offset', type: 'text', width: 20, expert: true },
            { name: 'formula', title: 'Formula', type: 'text', formulaDisabled: true, expert: true },
            { name: 'role', title: 'Role', type: 'select', options: roles, sorted: true },
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

    addItem = (): void => {
        const data: Register[] = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        const newItem: Register = {
            _address: '',
            address: 0,
            name: '',
            description: '',
            unit: '',
            type: 'uint16be',
            len: 1,
            factor: 1,
            offset: 0,
            formula: '',
            role: '',
            room: '',
            cw: false,
            isScale: false,
        } as Register;
        if (data.length) {
            const sortedData = this.getSortedData();
            const lastItem = sortedData[sortedData.length - 1].item;
            newItem._address =
                parseAddress(lastItem._address) + (lastItem.len ? parseInt(lastItem.len as string, 10) : 1);
            while (
                sortedData.find(
                    item =>
                        parseAddress(item.item._address) >= (newItem._address as number) &&
                        parseAddress(item.item._address) + parseInt((item.item.len as string) || '1', 10) <
                            (newItem._address as number),
                )
            ) {
                newItem._address++;
            }
            newItem.deviceId = lastItem.deviceId;
            newItem.type = lastItem.type;
            newItem.len = lastItem.len;
            newItem.factor = lastItem.factor;
            newItem.offset = lastItem.offset;
            newItem.formula = lastItem.formula;
            newItem.role = lastItem.role;
            newItem.cw = lastItem.cw;
            newItem.isScale = lastItem.isScale;
        } else {
            newItem.role = 'level';
            newItem.factor = 1;
            newItem.offset = 0;
            newItem._address = this.props.native.params.showAliases ? 30001 : 0;
        }
        newItem.address = this.addressToCanonical(newItem._address);
        data.push(newItem);
        this.props.onChange(this.nativeField, data);
    };

    getDisable = (index: number, name: keyof Register): boolean => {
        if (name === 'len') {
            if (
                !['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(
                    this.props.native[this.nativeField][index].type,
                )
            ) {
                return true;
            }
        }
        return false;
    };

    changeParam = (index: number, name: keyof Register, value: boolean | string | number): void => {
        const data: Register[] = JSON.parse(JSON.stringify(this.props.native[this.nativeField]));
        (data[index] as unknown as Record<string, string | boolean | number>)[name] = value;
        if (name === 'type') {
            if (
                ['', 'uint16be', 'uint16le', 'int16be', 'int16le', 'uint8be', 'uint8le', 'int8be', 'int8le'].includes(
                    value as RegisterEntryType,
                )
            ) {
                data[index].len = 1;
            }
            if (
                [
                    'uint32be',
                    'uint32le',
                    'uint32sw',
                    'uint32sb',
                    'int32be',
                    'int32le',
                    'int32sw',
                    'int32sb',
                    'floatbe',
                    'floatle',
                    'floatsw',
                    'floatsb',
                    'string',
                    'stringle',
                    'string16',
                    'string16le',
                    'rawhex',
                ].includes(value as RegisterEntryType)
            ) {
                data[index].len = 2;
            }
            if (['uint64be', 'uint64le', 'doublebe', 'doublele'].includes(value as RegisterEntryType)) {
                data[index].len = 4;
            }
        }

        if (name === '_address') {
            data[index].address = this.addressToCanonical(value as number | string);
        }

        this.props.onChange(this.nativeField, data);
    };
}
