import { EventEmitter } from 'node:events';
import Put from '../Put';

type ModbusFcState = 'init' | 'ready' | 'processing';

export default class ModbusServerCore extends EventEmitter {
    public readonly log: ioBroker.Logger;
    private data: {
        coils: Buffer;
        holding: Buffer;
        input: Buffer;
        discrete: Buffer;
    };

    private readonly handler: { [fc: number]: (pdu: Buffer, response: (result: Buffer) => void) => void } = {};
    private currentState: ModbusFcState = 'init';

    constructor(options: {
        logger: ioBroker.Logger;
        responseDelay?: number;
        coils?: Buffer;
        holding?: Buffer;
        input?: Buffer;
        discrete?: Buffer;
    }) {
        super();
        this.log = options.logger;

        this.data = {
            coils: options.coils || Buffer.alloc(1024),
            holding: options.holding || Buffer.alloc(1024),
            input: options.input || Buffer.alloc(1024),
            discrete: options.discrete || Buffer.alloc(1024),
        };

        this.handler = {
            1: this.onReadCoils,
            2: this.onReadDiscreteInputs,
            3: this.onReadHoldingRegisters,
            4: this.onReadInputRegisters,
            5: this.onWriteSingleCoil,
            6: this.onWriteSingleRegister,
            15: this.onWriteMultipleCoils,
            16: this.onWriteMultipleRegisters,
        };

        if (options.responseDelay) {
            const responseDelay = options.responseDelay;
            Object.keys(this.handler).forEach(fc => {
                const originalHandler = this.handler[parseInt(fc, 10)];
                this.handler[parseInt(fc, 10)] = (pdu, cb) => setTimeout(originalHandler, responseDelay, pdu, cb);
            });
        } else {
            Object.keys(this.handler).forEach(fc => {
                const originalHandler = this.handler[parseInt(fc, 10)];
                this.handler[parseInt(fc, 10)] = (pdu, cb) => setImmediate(originalHandler, pdu, cb);
            });
        }
    }

    inState(state: ModbusFcState): boolean {
        return this.currentState === state;
    }

    getState(): ModbusFcState {
        return this.currentState;
    }

    setState(newState: ModbusFcState): void {
        const oldState = this.currentState;

        this.currentState = newState;

        this.emit('stateChanged', oldState, newState);
        this.emit(`newState_${newState}`);
    }

    onData = (pdu: Buffer, callback: (response: Buffer) => void): void => {
        // get fc and byteCount in advance
        const fc = pdu.readUInt8(0);
        // const byteCount   = pdu.readUInt8(1);

        // get the pdu handler
        const reqHandler = this.handler[fc];

        if (!reqHandler) {
            // write a error/exception pkt to the
            // socket with error code fc + 0x80 and
            // exception code 0x01 (Illegal Function)

            this.log.debug(`no handler for FC${fc}`);

            callback(
                new Put()
                    .word8(fc + 0x80)
                    .word8(0x01)
                    .buffer(),
            );
        } else {
            reqHandler(pdu, response => callback(response));
        }
    };

    getCoils = (): Buffer => this.data.coils;
    getInput = (): Buffer => this.data.input;
    getHolding = (): Buffer => this.data.holding;
    getDiscrete = (): Buffer => this.data.discrete;

    // FC 1
    onReadCoils = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        if (pdu.length !== 5) {
            this.log.warn(`wrong pdu length for coils: ${pdu.length}. Expected 5`);
            cb(new Put().word8(0x81).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const quantity = pdu.readUInt16BE(3);

            this.emit('preReadCoilsRequest', start, quantity);

            const mem = this.getCoils();

            if (!quantity || start + quantity > mem.length * 8) {
                this.log.warn(
                    `FC${fc} request outside coils boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length * 8}`,
                );
                cb(new Put().word8(0x81).word8(0x02).buffer());
            } else {
                let val = 0;
                let thisByteBitCount = 0;
                const response = new Put().word8(0x01).word8(Math.floor(quantity / 8) + (quantity % 8 === 0 ? 0 : 1));

                for (let totalBitCount = start; totalBitCount < start + quantity; totalBitCount += 1) {
                    const buf = mem.readUInt8(Math.floor(totalBitCount / 8));
                    const mask = 1 << totalBitCount % 8;

                    if (buf & mask) {
                        val += 1 << thisByteBitCount % 8;
                    }

                    thisByteBitCount += 1;

                    if (thisByteBitCount % 8 === 0 || totalBitCount === start + quantity - 1) {
                        response.word8(val);
                        val = 0;
                    }
                }

                // this.log.debug(`FC${fc} finished read coils request: from ${start}, len ${quantity}`);
                cb(response.buffer());
            }
        }
    };

    // FC 2
    onReadDiscreteInputs = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        if (pdu.length !== 5) {
            this.log.warn(`wrong pdu length for discrete inputs: ${pdu.length}. Expected 5`);
            cb(new Put().word8(0x82).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const quantity = pdu.readUInt16BE(3);

            this.emit('readDiscreteInputsRequest', start, quantity);

            const mem = this.getDiscrete();

            if (!quantity || start + quantity > mem.length * 8) {
                this.log.warn(
                    `FC${fc} request outside discrete inputs boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length * 8}`,
                );
                cb(new Put().word8(0x82).word8(0x02).buffer());
            } else {
                let val = 0;
                let thisByteBitCount = 0;
                const response = new Put().word8(0x02).word8(Math.floor(quantity / 8) + (quantity % 8 === 0 ? 0 : 1));

                for (let totalBitCount = start; totalBitCount < start + quantity; totalBitCount += 1) {
                    const buf = mem.readUInt8(Math.floor(totalBitCount / 8));
                    const mask = 1 << totalBitCount % 8;

                    if (buf & mask) {
                        val += 1 << thisByteBitCount % 8;
                    }

                    thisByteBitCount += 1;

                    if (thisByteBitCount % 8 === 0 || totalBitCount === start + quantity - 1) {
                        response.word8(val);
                        val = 0;
                    }
                }

                // this.log.debug(`FC${fc} finished read discrete inputs request: from ${start}, len ${quantity}`);
                cb(response.buffer());
            }
        }
    };

    // FC 3
    onReadHoldingRegisters = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        if (pdu.length !== 5) {
            this.log.warn(`wrong pdu length for holding registers: ${pdu.length}. Expected 5`);
            cb(new Put().word8(0x83).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const byteStart = start * 2;
            const quantity = pdu.readUInt16BE(3);

            this.emit('readHoldingRegistersRequest', byteStart, quantity);

            const mem = this.getHolding();

            if (!quantity || byteStart + quantity * 2 > mem.length) {
                this.log.warn(
                    `FC${fc} request outside register boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length / 2}`,
                );
                cb(new Put().word8(0x83).word8(0x02).buffer());
            } else {
                const response = new Put().word8(0x03).word8(quantity * 2);

                for (let i = byteStart; i < byteStart + quantity * 2; i += 2) {
                    response.word16be(mem.readUInt16BE(i));
                }

                // this.log.debug(`FC${fc} finished read holding register request: from ${start}, len ${quantity}`);
                cb(response.buffer());
            }
        }
    };

    // FC 4
    onReadInputRegisters = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        if (pdu.length !== 5) {
            this.log.warn(`wrong pdu length for input registers: ${pdu.length}. Expected 5`);
            cb(new Put().word8(0x84).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const byteStart = start * 2;
            const quantity = pdu.readUInt16BE(3);

            this.emit('readInputRegistersRequest', byteStart, quantity);

            const mem = this.getInput();

            if (!quantity || byteStart + quantity * 2 > mem.length) {
                this.log.warn(
                    `FC${fc} request outside inputs registers boundaries: address ${start}, len ${quantity}. Expected from 0 to ${mem.length / 2}`,
                );
                cb(new Put().word8(0x84).word8(0x02).buffer());
            } else {
                const response = new Put().word8(0x04).word8(quantity * 2);

                for (let i = byteStart; i < byteStart + quantity * 2; i += 2) {
                    response.word16be(mem.readUInt16BE(i));
                }

                cb(response.buffer());
            }
        }
    };

    // FC 5
    onWriteSingleCoil = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        if (pdu.length !== 5) {
            cb(new Put().word8(0x85).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const address = pdu.readUInt16BE(1);
            const value = pdu.readUInt16BE(3) === 0xff00;

            if (pdu.readUInt16BE(3) !== 0x0000 && pdu.readUInt16BE(3) !== 0xff00) {
                this.log.warn(`FC${fc} write request outside coils boundaries: from ${address}, value ${value}`);
                cb(new Put().word8(0x85).word8(0x03).buffer());
            } else {
                this.emit('preWriteSingleCoilRequest', address, value);

                const mem = this.getCoils();

                if (address + 1 > mem.length * 8) {
                    this.log.warn(
                        `FC${fc} write request outside coils boundaries: from ${address}, value ${value}. Expected max address: ${mem.length * 8}`,
                    );
                    cb(new Put().word8(0x85).word8(0x02).buffer());
                } else {
                    const response = new Put()
                        .word8(0x05)
                        .word16be(address)
                        .word16be(value ? 0xff00 : 0x0000);
                    const oldValue = mem.readUInt8(Math.floor(address / 8));
                    let newValue;

                    if (value) {
                        newValue = oldValue | Math.pow(2, address % 8);
                    } else {
                        newValue = oldValue & ~Math.pow(2, address % 8);
                    }

                    mem.writeUInt8(newValue, Math.floor(address / 8));

                    this.emit('postWriteSingleCoilRequest', address, value);

                    this.log.debug(`FC${fc} finished writing single coil: at ${address}, value ${value}`);
                    cb(response.buffer());
                }
            }
        }
    };

    // FC 6
    onWriteSingleRegister = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        this.log.debug('handling write single register request.');

        if (pdu.length !== 5) {
            this.log.warn(`wrong pdu length for write single registers: ${pdu.length}. Expected 5`);
            cb(new Put().word8(0x86).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const address = pdu.readUInt16BE(1);
            const byteAddress = address * 2;
            const value = pdu.readUInt16BE(3);

            this.emit('preWriteSingleRegisterRequest', byteAddress, value);

            const mem = this.getHolding();

            if (byteAddress + 2 > mem.length) {
                this.log.warn(
                    `FC${fc} request outside holding register boundaries: from ${address}, value ${value}. Expected max address: ${mem.length / 2}`,
                );
                cb(new Put().word8(0x86).word8(0x02).buffer());
            } else {
                const response = new Put().word8(0x06).word16be(address).word16be(value).buffer();
                mem.writeUInt16BE(value, byteAddress);
                this.emit('postWriteSingleRegisterRequest', byteAddress, value);
                // this.log.debug(`FC${fc} finished writing single holding register: at ${address}, value ${value}`);
                cb(response);
            }
        }
    };

    // FC 15
    onWriteMultipleCoils = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        this.log.debug('handling write multiple coils request.');

        if (pdu.length < 3) {
            this.log.warn(`wrong pdu length for coils: ${pdu.length}. Expected 3`);
            cb(new Put().word8(0x8f).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const quantity = pdu.readUInt16BE(3);
            const byteCount = pdu.readUInt8(5);

            this.emit('preWriteMultipleCoilsRequest', start, quantity, byteCount);

            const mem = this.getCoils();

            // error response
            if (!quantity || start + quantity > mem.length * 8) {
                this.log.warn(
                    `FC${fc} request outside coils boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length * 8}`,
                );
                cb(new Put().word8(0x8f).word8(0x02).buffer());
            } else {
                const response = new Put().word8(0x0f).word16be(start).word16be(quantity).buffer();
                let oldValue;
                let newValue;
                let current = pdu.readUInt8(6);
                let j = 0;

                for (let i = start; i < start + quantity; i += 1) {
                    // reading old value from the coils register
                    oldValue = mem.readUInt8(Math.floor(i / 8));

                    // apply new value
                    if (Math.pow(2, j % 8) & current) {
                        newValue = oldValue | Math.pow(2, i % 8);
                    } else {
                        newValue = oldValue & ~Math.pow(2, i % 8);
                    }

                    // write to buffer
                    mem.writeUInt8(newValue, Math.floor(i / 8));

                    // read new value from request pdu
                    j += 1;

                    if (j % 8 === 0 && j < quantity) {
                        current = pdu.readUInt8(6 + Math.floor(j / 8));
                    }
                }

                this.emit('postWriteMultipleCoilsRequest', start, quantity, byteCount);

                cb(response);
            }
        }
    };

    // FC 16
    onWriteMultipleRegisters = (pdu: Buffer, cb: (pdu: Buffer, response?: (result: Buffer) => void) => void): void => {
        if (pdu.length < 3) {
            this.log.warn(`wrong pdu length for holding registers: ${pdu.length}. Expected 3`);
            cb(new Put().word8(0x90).word8(0x02).buffer());
        } else {
            const fc = pdu.readUInt8(0);
            const start = pdu.readUInt16BE(1);
            const byteStart = start * 2;
            const quantity = pdu.readUInt16BE(3);
            const byteCount = pdu.readUInt8(5);

            if (quantity > 123) {
                this.log.warn(`FC${fc} write length is too long: ${quantity}, len ${quantity}. Expected max len 123`);
                cb(new Put().word8(0x90).word8(0x03).buffer());
            } else {
                this.emit('preWriteMultipleRegistersRequest', byteStart, quantity, byteCount);

                const mem = this.getHolding();

                if (!quantity || byteStart + quantity * 2 > mem.length) {
                    this.log.warn(
                        `FC${fc} request outside holding registers boundaries: from ${start}, len ${quantity}. Expected max address ${mem.length / 2}`,
                    );
                    cb(new Put().word8(0x90).word8(0x02).buffer());
                } else {
                    const response = new Put().word8(0x10).word16be(start).word16be(quantity).buffer();
                    let j = 0;

                    for (let i = byteStart; i < byteStart + byteCount; i += 1) {
                        mem.writeUInt8(pdu.readUInt8(6 + j), i);
                        j++;
                    }

                    this.emit('postWriteMultipleRegistersRequest', byteStart, quantity, byteCount);

                    cb(response);
                }
            }
        }
    };
}
