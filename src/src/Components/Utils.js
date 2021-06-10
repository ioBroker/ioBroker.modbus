const _rmap = {
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
    15: 0
};
const _dmap = {
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
    15: 15
};

const offsets = {
    coils: 1,
    disInputs: 10001,
    inputRegs: 30001,
    holdingRegs: 40001,
};

function address2alias(regType, address) {
    return parseInt(address, 10) + offsets[regType];
}

function alias2address(regType, alias) {
    return parseInt(alias, 10) - offsets[regType];
}

function nonDirect2direct(regType, address) {
    if (regType === 'disInputs' || regType === 'coils') {
        address = parseInt(address, 10) || 0;
        address = Math.floor(address / 16) * 16 + _dmap[address % 16];
    }

    return address;
}

function direct2nonDirect(regType, address) {
    if (regType === 'disInputs' || regType === 'coils') {
        address = parseInt(address, 10) || 0;
        address = Math.floor(address / 16) * 16 + _rmap[address % 16];
        return address;
    } else {
        return address;
    }
}

export {
    address2alias,
    alias2address,
    nonDirect2direct,
    direct2nonDirect
};