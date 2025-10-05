import type { RegisterEntryType } from '../types';

export function extractValue(type: RegisterEntryType, len: number, buffer: Buffer, offset: number): string | number {
    let i1: number;
    let i2: number;
    let buf: Buffer;
    let _len: number;
    let str = '';

    switch (type) {
        case 'uint8be':
            return buffer.readUInt8(offset * 2 + 1);
        case 'uint8le':
            return buffer.readUInt8(offset * 2);
        case 'int8be':
            return buffer.readInt8(offset * 2 + 1);
        case 'int8le':
            return buffer.readInt8(offset * 2);
        case 'uint16be':
            return buffer.readUInt16BE(offset * 2);
        case 'uint16le':
            return buffer.readUInt16LE(offset * 2);
        case 'int16be':
            return buffer.readInt16BE(offset * 2);
        case 'int16le':
            return buffer.readInt16LE(offset * 2);
        case 'uint32be':
            return buffer.readUInt32BE(offset * 2);
        case 'uint32le':
            return buffer.readUInt32LE(offset * 2);
        case 'uint32sw':
            buf = Buffer.alloc(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readUInt32BE(0);
        case 'uint32sb':
            buf = Buffer.alloc(4);
            buf[0] = buffer[offset * 2 + 1];
            buf[1] = buffer[offset * 2 + 0];
            buf[2] = buffer[offset * 2 + 3];
            buf[3] = buffer[offset * 2 + 2];
            return buf.readUInt32BE(0);
        case 'int32be':
            return buffer.readInt32BE(offset * 2);
        case 'int32le':
            return buffer.readInt32LE(offset * 2);
        case 'int32sw':
            buf = Buffer.alloc(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readInt32BE(0);
        case 'int32sb':
            buf = Buffer.alloc(4);
            buf[0] = buffer[offset * 2 + 1];
            buf[1] = buffer[offset * 2 + 0];
            buf[2] = buffer[offset * 2 + 3];
            buf[3] = buffer[offset * 2 + 2];
            return buf.readInt32BE(0);
        case 'uint64be':
            return buffer.readUInt32BE(offset * 2) * 0x100000000 + buffer.readUInt32BE(offset * 2 + 4);
        case 'uint64le':
            return buffer.readUInt32LE(offset * 2) + buffer.readUInt32LE(offset * 2 + 4) * 0x100000000;
        case 'int64be':
            i1 = buffer.readInt32BE(offset * 2);
            i2 = buffer.readUInt32BE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            }
            return i1 * 0x100000000 - i2; // I have no solution for that !

        case 'int64le':
            i2 = buffer.readUInt32LE(offset * 2);
            i1 = buffer.readInt32LE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            }
            return i1 * 0x100000000 - i2; // I have no solution for that !

        case 'floatbe':
            return buffer.readFloatBE(offset * 2);
        case 'floatle':
            return buffer.readFloatLE(offset * 2);
        case 'floatsw':
            buf = Buffer.alloc(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readFloatBE(0);
        case 'floatsb':
            buf = Buffer.alloc(4);
            buf[0] = buffer[offset * 2 + 1];
            buf[1] = buffer[offset * 2 + 0];
            buf[2] = buffer[offset * 2 + 3];
            buf[3] = buffer[offset * 2 + 2];
            return buf.readFloatBE(0);
        case 'doublebe':
            return buffer.readDoubleBE(offset * 2);
        case 'doublele':
            return buffer.readDoubleLE(offset * 2);
        case 'string':
            // find length
            _len = 0;
            while (buffer[offset * 2 + _len] && _len < len * 2) {
                _len++;
            }

            return buffer.toString('ascii', offset * 2, offset * 2 + _len);
        case 'stringle':
            // find length
            _len = 0;
            while (_len < len * 2) {
                if (buffer[offset * 2 + _len + 1]) {
                    str += String.fromCharCode(buffer[offset * 2 + _len + 1]);

                    if (buffer[offset * 2 + _len]) {
                        str += String.fromCharCode(buffer[offset * 2 + _len]);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
                _len += 2;
            }
            return str;
        case 'string16':
        case 'string16le': {
            // find length
            _len = 0;
            const corr = type === 'string16' ? 1 : 0;
            while (_len < len * 2) {
                const pos = offset * 2 + _len;
                if (buffer[pos] || buffer[pos + 1]) {
                    str += String.fromCharCode(buffer[pos + corr] + (buffer[pos + (1 - corr)] << 8));
                } else {
                    break;
                }
                _len += 2;
            }
            return str;
        }
        case 'rawhex':
            // find length
            _len = 0;
            while (_len < len * 2) {
                str += buffer[offset * 2 + _len].toString(16).padStart(2, '0');
                _len += 1;
            }
            return str;
        default:
            throw new Error(`Invalid type: ${type}`);
    }
}

export function writeValue(type: RegisterEntryType, value: number | string, len?: number): Buffer {
    let a0;
    let a1;
    let a2;
    let buffer;
    let _len;

    switch (type) {
        case 'uint8be':
            buffer = Buffer.alloc(2);
            buffer[0] = 0;
            buffer.writeUInt8((value as number) & 0xff, 1);
            break;
        case 'uint8le':
            buffer = Buffer.alloc(2);
            buffer[1] = 0;
            buffer.writeUInt8((value as number) & 0xff, 0);
            break;
        case 'int8be':
            buffer = Buffer.alloc(2);
            buffer[0] = 0;
            buffer.writeInt8((value as number) & 0xff, 1);
            break;
        case 'int8le':
            buffer = Buffer.alloc(2);
            buffer[1] = 0;
            buffer.writeInt8((value as number) & 0xff, 0);
            break;
        case 'uint16be':
            buffer = Buffer.alloc(2);
            buffer.writeUInt16BE(value as number, 0);
            break;
        case 'uint16le':
            buffer = Buffer.alloc(2);
            buffer.writeUInt16LE(value as number, 0);
            break;
        case 'int16be':
            buffer = Buffer.alloc(2);
            buffer.writeInt16BE(value as number, 0);
            break;
        case 'int16le':
            buffer = Buffer.alloc(2);
            buffer.writeInt16LE(value as number, 0);
            break;
        case 'uint32be':
            buffer = Buffer.alloc(4);
            buffer.writeUInt32BE(value as number, 0);
            break;
        case 'uint32le':
            buffer = Buffer.alloc(4);
            buffer.writeUInt32LE(value as number, 0);
            break;
        case 'uint32sw':
            buffer = Buffer.alloc(4);
            buffer.writeUInt32BE(value as number, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'uint32sb':
            buffer = Buffer.alloc(4);
            buffer.writeUInt32BE(value as number, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'int32be':
            buffer = Buffer.alloc(4);
            buffer.writeInt32BE(value as number, 0);
            break;
        case 'int32le':
            buffer = Buffer.alloc(4);
            buffer.writeInt32LE(value as number, 0);
            break;
        case 'int32sw':
            buffer = Buffer.alloc(4);
            buffer.writeInt32BE(value as number, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'int32sb':
            buffer = Buffer.alloc(4);
            buffer.writeInt32BE(value as number, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'uint64be':
            buffer = Buffer.alloc(8);
            buffer.writeUInt32BE((value as number) >> 32, 0);
            buffer.writeUInt32BE((value as number) & 0xffffffff, 4);
            break;
        case 'uint64le':
            buffer = Buffer.alloc(8);
            buffer.writeUInt32LE((value as number) & 0xffffffff, 0);
            buffer.writeUInt32LE((value as number) >> 32, 4);
            break;
        case 'int64be':
            buffer = Buffer.alloc(8);
            buffer.writeInt32BE((value as number) >> 32, 0);
            buffer.writeUInt32BE((value as number) & 0xffffffff, 4);
            break;
        case 'int64le':
            buffer = Buffer.alloc(8);
            buffer.writeUInt32LE((value as number) & 0xffffffff, 0);
            buffer.writeInt32LE((value as number) >> 32, 4);
            break;
        case 'floatbe':
            buffer = Buffer.alloc(4);
            buffer.writeFloatBE(value as number, 0);
            break;
        case 'floatle':
            buffer = Buffer.alloc(4);
            buffer.writeFloatLE(value as number, 0);
            break;
        case 'floatsw':
            buffer = Buffer.alloc(4);
            buffer.writeFloatBE(value as number, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'floatsb':
            buffer = Buffer.alloc(4);
            buffer.writeFloatBE(value as number, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'doublebe':
            buffer = Buffer.alloc(8);
            buffer.writeDoubleBE(value as number, 0);
            break;
        case 'doublele':
            buffer = Buffer.alloc(8);
            buffer.writeDoubleLE(value as number, 0);
            break;
        case 'string':
            if (value === null) {
                value = 'null';
            }
            value = value.toString();
            _len = value.length + 1;
            if (_len % 2) {
                _len++;
            }
            buffer = Buffer.alloc(_len);
            buffer.write(value, 0, value.length > _len ? _len : value.length, 'ascii');
            break;
        case 'stringle':
            if (value === null) {
                value = 'null';
            }
            value = value.toString();
            _len = value.length + 1;
            if (_len % 2) {
                _len++;
            }
            buffer = Buffer.alloc(_len);
            for (let b = 0; b < _len >> 1; b++) {
                buffer.writeInt16LE((value.charCodeAt(b * 2) << 8) | value.charCodeAt(b * 2 + 1), b << 1);
                if (b * 2 + 2 >= buffer.length) {
                    break;
                }
            }
            break;
        case 'string16':
        case 'string16le':
            if (value === null) {
                value = 'null';
            }
            value = value.toString();
            _len = value.length + 1;
            buffer = Buffer.alloc(len! * 2);
            for (let b = 0; b < _len && b < len!; b++) {
                buffer.writeInt16LE(value.charCodeAt(b) << (type === 'string16' ? 8 : 0), b * 2);
            }
            break;
        case 'rawhex': {
            if (value === null) {
                value = '';
            }
            value = value.toString();
            const _buffer = Buffer.from(value, 'hex');
            // fix length
            buffer = Buffer.alloc(len! * 2);
            _buffer.copy(buffer);
            break;
        }
        default:
            throw new Error(`Invalid type: ${type}`);
    }
    return buffer;
}
