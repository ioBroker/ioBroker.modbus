/**
 * Device detection of the template library (no React, so it can be tested on its own).
 *
 * A template can define probes in its `detect` block: registers to read (raw address, function code 3 or 4) and the
 * expected value. The adapter backend reads the registers (command `readRegisters`), here the answers are matched.
 */

export interface DetectProbe {
    registerType: 'holdingRegs' | 'inputRegs';
    /** raw address on the wire, without alias offset */
    address: number;
    type: 'string' | 'uint16' | 'int16' | 'uint32' | 'int32';
    /** number of registers, only for strings */
    len?: number;
    equals?: string | number;
    startsWith?: string;
    oneOf?: (string | number)[];
    range?: [number, number];
}

export interface DetectBlock {
    probes: DetectProbe[];
    /** the probes could also match other devices */
    weak?: boolean;
    note?: string;
}

export interface DetectRead {
    registerType: 'holdingRegs' | 'inputRegs';
    address: number;
    len: number;
}

export interface DetectReadResult {
    registers?: number[];
    error?: string;
    exceptionCode?: number;
}

export interface DetectMatch {
    id: string;
    weak: boolean;
}

const TYPE_LEN: Record<DetectProbe['type'], number> = { string: 0, uint16: 1, int16: 1, uint32: 2, int32: 2 };

export function probeLength(probe: DetectProbe): number {
    return probe.type === 'string' ? probe.len || 1 : TYPE_LEN[probe.type] || 1;
}

function readKey(r: DetectRead): string {
    return `${r.registerType}:${r.address}:${r.len}`;
}

/** All reads needed for the given templates, every register range only once */
export function collectReads(templates: { detect?: DetectBlock }[]): DetectRead[] {
    const reads = new Map<string, DetectRead>();
    for (const t of templates) {
        for (const probe of t.detect?.probes || []) {
            const r = { registerType: probe.registerType, address: probe.address, len: probeLength(probe) };
            reads.set(readKey(r), r);
        }
    }
    return [...reads.values()];
}

/** Decodes the registers of a probe. Strings: 2 characters per register, high byte first, without \0 and spaces */
export function decodeProbe(registers: number[], probe: DetectProbe): string | number | null {
    const len = probeLength(probe);
    if (registers.length < len) {
        return null;
    }
    if (probe.type === 'string') {
        let text = '';
        for (let i = 0; i < len; i++) {
            text += String.fromCharCode((registers[i] >> 8) & 0xff, registers[i] & 0xff);
        }
        const NUL = String.fromCharCode(0);
        while (text.endsWith(NUL)) {
            text = text.slice(0, -1);
        }
        return text.split(NUL).join(' ').trim();
    }
    if (probe.type === 'uint16') {
        return registers[0] & 0xffff;
    }
    if (probe.type === 'int16') {
        const v = registers[0] & 0xffff;
        return v > 0x7fff ? v - 0x10000 : v;
    }
    const v = (registers[0] & 0xffff) * 0x10000 + (registers[1] & 0xffff);
    return probe.type === 'int32' && v > 0x7fffffff ? v - 0x100000000 : v;
}

export function probeMatches(value: string | number | null, probe: DetectProbe): boolean {
    if (value === null) {
        return false;
    }
    if (probe.equals !== undefined) {
        return value === probe.equals;
    }
    if (probe.startsWith !== undefined) {
        return typeof value === 'string' && value.startsWith(probe.startsWith);
    }
    if (probe.oneOf) {
        return probe.oneOf.includes(value);
    }
    if (probe.range) {
        return typeof value === 'number' && value >= probe.range[0] && value <= probe.range[1];
    }
    return false;
}

/**
 * Templates whose probes all match. Strong matches first.
 *
 * @param templates templates with detect block
 * @param reads the reads sent to the adapter
 * @param results the answers of the adapter, same order as reads
 */
export function matchTemplates(
    templates: { id: string; detect?: DetectBlock }[],
    reads: DetectRead[],
    results: DetectReadResult[],
): DetectMatch[] {
    const answers = new Map<string, DetectReadResult>();
    reads.forEach((r, i) => answers.set(readKey(r), results[i] || {}));
    const matches: DetectMatch[] = [];
    for (const t of templates) {
        const probes = t.detect?.probes;
        if (!probes?.length) {
            continue;
        }
        const ok = probes.every(probe => {
            const answer = answers.get(
                readKey({ registerType: probe.registerType, address: probe.address, len: probeLength(probe) }),
            );
            return !!answer?.registers && probeMatches(decodeProbe(answer.registers, probe), probe);
        });
        if (ok) {
            matches.push({ id: t.id, weak: !!t.detect?.weak });
        }
    }
    return matches.sort((a, b) => Number(a.weak) - Number(b.weak));
}
