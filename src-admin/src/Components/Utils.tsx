import type { RegisterType } from '../types';

const _rmap: { [bit: number]: number } = {
    0: 15,
    1: 14,
    2: 13,
    3: 12,
    4: 11,
    5: 10,
    6: 9,
    7: 8,
    8: 7,
    9: 6,
    10: 5,
    11: 4,
    12: 3,
    13: 2,
    14: 1,
    15: 0,
};
const _dmap: { [bit: number]: number } = {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    11: 11,
    12: 12,
    13: 13,
    14: 14,
    15: 15,
};

const offsets: { [registerType: string]: number } = {
    coils: 1,
    disInputs: 10001,
    inputRegs: 30001,
    holdingRegs: 40001,
};

export function address2alias(regType: RegisterType, address: string | number): number {
    return parseInt(address as string, 10) + offsets[regType];
}

export function alias2address(regType: RegisterType, alias: string | number): number {
    return parseInt(alias as string, 10) - offsets[regType];
}

export function nonDirect2direct(regType: RegisterType, address: string | number): number {
    if (regType === 'disInputs' || regType === 'coils') {
        address = parseInt(address as string, 10) || 0;
        address = Math.floor(address / 16) * 16 + _dmap[address % 16];
    }

    return parseInt(address as string, 10) || 0;
}

export function direct2nonDirect(regType: RegisterType, address: string | number): number {
    if (regType === 'disInputs' || regType === 'coils') {
        address = parseInt(address as string, 10) || 0;
        address = Math.floor(address / 16) * 16 + _rmap[address % 16];
        return address;
    }
    return parseInt(address as string, 10) || 0;
}

export function parseAddress(addressStr: string | number): number {
    if (typeof addressStr === 'string' && addressStr.toLowerCase().startsWith('0x')) {
        return parseInt(addressStr, 16);
    }

    return parseInt(addressStr as string, 10) || 0;
}
