'use strict';

function extractValue(type, len, buffer, offset) {
    let i1;
    let i2;
    let buf;

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
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readUInt32BE(0);
        case 'uint32sb':
            buf = new Buffer(4);
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
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readInt32BE(0);
        case 'int32sb':
            buf = new Buffer(4);
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
            } else {
                return i1 * 0x100000000 - i2; // I have no solution for that !
            }
            break;
        case 'int64le':
            i2 = buffer.readUInt32LE(offset * 2);
            i1 = buffer.readInt32LE(offset * 2 + 4);
            if (i1 >= 0) {
                return i1 * 0x100000000 + i2; // <<32 does not work
            } else {
                return i1 * 0x100000000 - i2; // I have no solution for that !
            }
            break;
        case 'floatbe':
            return buffer.readFloatBE(offset * 2);
        case 'floatle':
            return buffer.readFloatLE(offset * 2);
        case 'floatsw':
            buf = new Buffer(4);
            buf[0] = buffer[offset * 2 + 2];
            buf[1] = buffer[offset * 2 + 3];
            buf[2] = buffer[offset * 2 + 0];
            buf[3] = buffer[offset * 2 + 1];
            return buf.readFloatBE(0);
        case 'floatsb':
            buf = new Buffer(4);
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
            let _len = 0;
            while (buffer[offset * 2 + _len] && _len < len * 2) {
                _len++;
            }

            return buffer.toString('ascii', offset * 2, offset * 2 + _len);
        case 'stringle':
            // find length
            let __len = 0;
            let str = '';
            while (__len < len * 2) {
                if (buffer[offset * 2 + __len + 1]) {
                    str += String.fromCharCode(buffer[offset * 2 + __len + 1]);

                    if (buffer[offset * 2 + __len]) {
                        str += String.fromCharCode(buffer[offset * 2 + __len]);
                    } else {
                        break;
                    }
                } else {
                    break;
                }
                __len += 2;
            }
            return str;
        default:
            throw new Error('Invalid type: ' + type);
            return 0;
    }
}

function writeValue(type, value, len) {
    let a0;
    let a1;
    let a2;
    let buffer;

    switch (type) {
        case 'uint8be':
            buffer = new Buffer(2);
            buffer[0] = 0;
            buffer.writeUInt8(value & 0xFF, 1);
            break;
        case 'uint8le':
            buffer = new Buffer(2);
            buffer[1] = 0;
            buffer.writeUInt8(value & 0xFF, 0);
            break;
        case 'int8be':
            buffer = new Buffer(2);
            buffer[0] = 0;
            buffer.writeInt8(value & 0xFF, 1);
            break;
        case 'int8le':
            buffer = new Buffer(2);
            buffer[1] = 0;
            buffer.writeInt8(value & 0xFF, 0);
            break;
        case 'uint16be':
            buffer = new Buffer(2);
            buffer.writeUInt16BE(value, 0);
            break;
        case 'uint16le':
            buffer = new Buffer(2);
            buffer.writeUInt16LE(value, 0);
            break;
        case 'int16be':
            buffer = new Buffer(2);
            buffer.writeInt16BE(value, 0);
            break;
        case 'int16le':
            buffer = new Buffer(2);
            buffer.writeInt16LE(value, 0);
            break;
        case 'uint32be':
            buffer = new Buffer(4);
            buffer.writeUInt32BE(value, 0);
            break;
        case 'uint32le':
            buffer = new Buffer(4);
            buffer.writeUInt32LE(value, 0);
            break;
        case 'uint32sw':
            buffer = new Buffer(4);
            buffer.writeUInt32BE(value, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'uint32sb':
            buffer = new Buffer(4);
            buffer.writeUInt32BE(value, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'int32be':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            break;
        case 'int32le':
            buffer = new Buffer(4);
            buffer.writeInt32LE(value, 0);
            break;
        case 'int32sw':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'int32sb':
            buffer = new Buffer(4);
            buffer.writeInt32BE(value, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'uint64be':
            buffer = new Buffer(8);
            buffer.writeUInt32BE(value >> 32, 0);
            buffer.writeUInt32BE(value & 0xFFFFFFFF, 4);
            break;
        case 'uint64le':
            buffer = new Buffer(8);
            buffer.writeUInt32LE(value & 0xFFFFFFFF, 0);
            buffer.writeUInt32LE(value >> 32, 4);
            break;
        case 'int64be':
            buffer = new Buffer(8);
            buffer.writeInt32BE(value >> 32, 0);
            buffer.writeUInt32BE(value & 0xFFFFFFFF, 4);
            break;
        case 'int64le':
            buffer = new Buffer(8);
            buffer.writeUInt32LE(value & 0xFFFFFFFF, 0);
            buffer.writeInt32LE(value >> 32, 4);
            break;
        case 'floatbe':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            break;
        case 'floatle':
            buffer = new Buffer(4);
            buffer.writeFloatLE(value, 0);
            break;
        case 'floatsw':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            a0 = buffer[0];
            a1 = buffer[1];
            buffer[0] = buffer[2];
            buffer[1] = buffer[3];
            buffer[2] = a0;
            buffer[3] = a1;
            break;
        case 'floatsb':
            buffer = new Buffer(4);
            buffer.writeFloatBE(value, 0);
            a0 = buffer[0];
            a2 = buffer[2];
            buffer[0] = buffer[1];
            buffer[2] = buffer[3];
            buffer[1] = a0;
            buffer[3] = a2;
            break;
        case 'doublebe':
            buffer = new Buffer(8);
            buffer.writeDoubleBE(value, 0);
            break;
        case 'doublele':
            buffer = new Buffer(8);
            buffer.writeDoubleLE(value, 0);
            break;
        case 'string':
            if (value === null) value = 'null';
            value = value.toString();
            let _len = (value.length + 1);
            if (_len % 2) _len++;
            buffer = new Buffer(_len);
            buffer.write(value, 0, value.length > _len ? _len : value.length, 'ascii');
            break;
        case 'stringle':
            if (value === null) value = 'null';
            value = value.toString();
            let __len = (value.length + 1);
            if (__len % 2) __len++;
            buffer = new Buffer(__len);
            for (let b = 0; b < (__len >> 1); b++) {
                buffer.writeInt16LE((value.charCodeAt(b * 2) << 8) | value.charCodeAt(b * 2 + 1), b << 1);
                if (b * 2 + 2 >= buffer.length) {
                    break;
                }
            }
            break;
        default:
            throw new Error('Invalid type: ' + type);
            buffer = new Buffer(2);
            break;
    }
    return buffer;
}

function getJSModbusPath() {
    let path = require.resolve('jsmodbus/package.json');
    let parts__ = path.replace(/\\/g, '/').split('/');
    parts__.pop();
    path = parts__.join('/');
    return path;
}

module.exports = {
    writeValue,
    extractValue,
    getJSModbusPath
};
