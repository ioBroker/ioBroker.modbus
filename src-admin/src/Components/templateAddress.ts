/**
 * Address conversion for the template library (no React, so it can be tested on its own).
 *
 * Bit order of coils and discrete inputs with aliases, as in `ModbusAdapter.address2alias` of `@iobroker/modbus`:
 * - "direct addresses" on: alias = offset + bit address
 * - "direct addresses" off: the 16 bits of each block are reversed, alias 10001 is bit 15 of the first block
 */
export type AddressRegisterType = 'disInputs' | 'coils' | 'inputRegs' | 'holdingRegs';

/** Offsets of the alias addresses as used in the templates (independent of the instance settings) */
export const DEFAULT_OFFSETS: Record<AddressRegisterType, number> = {
    coils: 1,
    disInputs: 10001,
    inputRegs: 30001,
    holdingRegs: 40001,
};

export function isBitType(regType: AddressRegisterType): boolean {
    return regType === 'coils' || regType === 'disInputs';
}

/** Reverses the bit position inside a block of 16 bits (0 <-> 15, 1 <-> 14, ...). The function is its own inverse. */
function reverseInBlock(address: number): number {
    return ((address >> 4) << 4) + (15 - (address % 16));
}

/**
 * Template address -> Modbus address on the wire (0..65535).
 * Returns NaN if the template address does not fit to the given format.
 */
export function templateToRaw(
    templateAddress: number,
    regType: AddressRegisterType,
    addressing: 'raw' | 'alias',
    directAddresses: boolean,
): number {
    if (Number.isNaN(templateAddress)) {
        return NaN;
    }
    if (addressing === 'raw') {
        return templateAddress >= 0 && templateAddress <= 65535 ? templateAddress : NaN;
    }
    const address = templateAddress - DEFAULT_OFFSETS[regType];
    if (address < 0 || address > 65535) {
        return NaN;
    }
    return isBitType(regType) && !directAddresses ? reverseInBlock(address) : address;
}

/** Modbus address on the wire -> `_address` as shown in an instance with the given settings */
export function rawToInstance(
    raw: number,
    regType: AddressRegisterType,
    showAliases: boolean,
    directAddresses: boolean,
    instanceOffset: number,
): number {
    if (!showAliases) {
        return raw;
    }
    return (isBitType(regType) && !directAddresses ? reverseInBlock(raw) : raw) + instanceOffset;
}
