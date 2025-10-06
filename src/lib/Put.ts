export default class Put {
    private words: ({ endian?: 'little' | 'big'; bytes: number | 'float'; value: number } | { buffer: Buffer })[] = [];
    private len = 0;

    put(buf: Buffer): Put {
        this.words.push({ buffer: buf });
        this.len += buf.length;
        return this;
    }

    word8(x: number): Put {
        this.words.push({ bytes: 1, value: x });
        this.len += 1;
        return this;
    }

    floatle(x: number): Put {
        this.words.push({ bytes: 'float', endian: 'little', value: x });
        this.len += 4;
        return this;
    }

    word8be(x: number): Put {
        this.words.push({ endian: 'big', bytes: 1, value: x });
        this.len += 1;
        return this;
    }

    word8le(x: number): Put {
        this.words.push({ endian: 'little', bytes: 1, value: x });
        this.len += 1;
        return this;
    }

    word16be(x: number): Put {
        this.words.push({ endian: 'big', bytes: 2, value: x });
        this.len += 2;
        return this;
    }

    word16le(x: number): Put {
        this.words.push({ endian: 'little', bytes: 2, value: x });
        this.len += 2;
        return this;
    }

    word32be(x: number): Put {
        this.words.push({ endian: 'big', bytes: 4, value: x });
        this.len += 4;
        return this;
    }

    word32le(x: number): Put {
        this.words.push({ endian: 'little', bytes: 4, value: x });
        this.len += 4;
        return this;
    }

    word64be(x: number): Put {
        this.words.push({ endian: 'big', bytes: 8, value: x });
        this.len += 8;
        return this;
    }

    word64le(x: number): Put {
        this.words.push({ endian: 'little', bytes: 8, value: x });
        this.len += 8;
        return this;
    }

    pad(bytes: number): Put {
        this.words.push({ endian: 'big', bytes: bytes, value: 0 });
        this.len += bytes;
        return this;
    }

    length(): number {
        return this.len;
    }

    buffer(): Buffer {
        const buf = Buffer.alloc(this.len);
        let offset = 0;
        this.words.forEach(word => {
            if ((word as { buffer: Buffer }).buffer) {
                (word as { buffer: Buffer }).buffer.copy(buf, offset, 0);
                offset += (word as { buffer: Buffer }).buffer.length;
                return;
            }

            const wordTyped = word as { endian?: 'little' | 'big'; bytes: number | 'float'; value: number };
            if (wordTyped.bytes === 'float') {
                // s * f * 2^e
                const v = Math.abs(wordTyped.value);
                const s = wordTyped.value >= 0 ? 1 : 0;
                const e = Math.ceil(Math.log(v) / Math.LN2);
                const f = v / (1 << e);

                // s:1, e:7, f:23
                // [seeeeeee][efffffff][ffffffff][ffffffff]
                buf[offset++] = (s << 7) & ~~(e / 2);
                buf[offset++] = ((e & 1) << 7) & ~~(f / (1 << 16));
                buf[offset++] = 0;
                buf[offset++] = 0;
                offset += 4;
            } else {
                const big = wordTyped.endian === 'big';
                const ix = big ? [(wordTyped.bytes - 1) * 8, -8] : [0, 8];

                for (let i = ix[0]; big ? i >= 0 : i < wordTyped.bytes * 8; i += ix[1]) {
                    if (i >= 32) {
                        buf[offset++] = Math.floor(wordTyped.value / Math.pow(2, i)) & 0xff;
                    } else {
                        buf[offset++] = (wordTyped.value >> i) & 0xff;
                    }
                }
            }
        });
        return buf;
    }

    write(stream: NodeJS.WritableStream): void {
        stream.write(this.buffer());
    }
}
