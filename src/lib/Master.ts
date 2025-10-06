import type { DeviceMasterOption, MasterDevice, Options, RegisterType } from '../types';
import { extractValue, writeValue } from './common';
import type { ModbusReadResultBinary } from './jsmodbus/modbus-client-core';
import ModbusClientSerial from './jsmodbus/transports/modbus-client-serial';
import ModbusClientTcp from './jsmodbus/transports/modbus-client-tcp';
import ModbusClientTcpRtu from './jsmodbus/transports/modbus-client-tcp-rtu';
import ModbusClientTcpSsl from './jsmodbus/transports/modbus-client-tcp-ssl';
import { createLoggingWrapper } from './loggingUtils';

export class Master {
    private readonly modbusClient;
    private connected = false;
    private connectTimer: ioBroker.Timeout | undefined;
    private nextPoll: ioBroker.Timeout | undefined;
    private pollTime?: number;
    private errorCount = 0;
    private readonly ackObjects: { [id: string]: { val: ioBroker.StateValue } } = {};
    private readonly objects: Options['objects'];
    private isStop = false;
    private pulseList: { [id: string]: ioBroker.StateValue } = {};
    private sendBuffer: { [id: string]: ioBroker.StateValue } = {};
    private readonly devices: Options['devices'];
    private readonly deviceIds: number[];
    private reconnectTimeout: ioBroker.Timeout | undefined;
    private keepAliveTimeout: ioBroker.Timeout | undefined;
    private readonly adapter: ioBroker.Adapter;
    private readonly options: Options;
    private scaleFactors: { [deviceId: number]: { [address: number]: number | string } } = {};

    private readonly showDebug: boolean;

    constructor(options: Options, adapter: ioBroker.Adapter) {
        this.adapter = adapter;
        this.options = options;
        this.devices = options.devices;
        this.objects = options.objects;
        this.deviceIds = Object.keys(options.devices).map(id => parseInt(id, 10));
        this.showDebug = adapter.common?.loglevel === 'debug' || adapter.common?.loglevel === 'silly';

        void adapter.setState('info.connection', false, true);

        // delete all server connection information
        void adapter.getStatesAsync('info.clients.*').then(async states => {
            for (const id in states) {
                await adapter.delForeignObjectAsync(id);
            }
        });

        if (options.config.type === 'tcp') {
            const tcp = options.config.tcp;
            if (!tcp || !tcp.bind || tcp.bind === '0.0.0.0') {
                adapter.log.error('IP address is not defined');
                return;
            }
            try {
                const logWrapper = createLoggingWrapper(adapter.log, options.config.disableLogging);
                this.modbusClient = new ModbusClientTcp({
                    tcp: {
                        host: tcp.bind,
                        port: tcp.port || 502,
                        autoReconnect: false,
                    },
                    logger: logWrapper,
                    timeout: options.config.timeout,
                    unitId: options.config.defaultDeviceId,
                });
            } catch (e) {
                adapter.log.error(`Cannot connect to "${tcp.bind}:${tcp.port || 502}": ${e}`);
            }
        } else if (options.config.type === 'tcp-ssl') {
            const tcp = options.config.tcp;
            if (!tcp || !tcp.bind || tcp.bind === '0.0.0.0') {
                adapter.log.error('IP address is not defined');
                return;
            }
            try {
                const logWrapper = createLoggingWrapper(adapter.log, options.config.disableLogging);
                if (!options.config.ssl?.cert || !options.config.ssl?.key) {
                    adapter.log.error('SSL certificate or key is not defined');
                    return;
                }
                // Prepare SSL configuration
                const sslConfig: {
                    rejectUnauthorized: boolean;
                    cert: string;
                    key: string;
                    ca?: string;
                } = {
                    rejectUnauthorized: options.config.ssl?.rejectUnauthorized !== false,
                    cert: options.config.ssl.cert,
                    key: options.config.ssl.key,
                    ca: options.config.ssl.ca,
                };

                this.modbusClient = new ModbusClientTcpSsl({
                    tcp: {
                        host: tcp.bind,
                        port: tcp.port || 502,
                        autoReconnect: false,
                    },
                    ssl: sslConfig,
                    logger: logWrapper,
                    timeout: options.config.timeout,
                    unitId: options.config.defaultDeviceId,
                });
            } catch (e) {
                adapter.log.error(`Cannot connect to SSL "${tcp.bind}:${tcp.port || 502}": ${e}`);
            }
        } else if (options.config.type === 'tcprtu') {
            const tcp = options.config.tcp;
            if (!tcp || !tcp.bind || tcp.bind === '0.0.0.0') {
                adapter.log.error('IP address is not defined');
                return;
            }
            try {
                const logWrapper = createLoggingWrapper(adapter.log, options.config.disableLogging);
                this.modbusClient = new ModbusClientTcpRtu({
                    tcp: {
                        host: tcp.bind,
                        port: tcp.port || 502,
                        autoReconnect: false,
                    },
                    logger: logWrapper,
                    timeout: options.config.timeout,
                    unitId: options.config.defaultDeviceId,
                });
            } catch (e) {
                adapter.log.error(`Cannot connect to "${tcp.bind}:${tcp.port || 502}": ${e}`);
            }
        } else if (options.config.type === 'serial') {
            const serial = options.config.serial;
            if (!serial || !serial.comName) {
                adapter.log.error('Serial device name is not defined');
                return;
            }

            try {
                const logWrapper = createLoggingWrapper(adapter.log, options.config.disableLogging);
                this.modbusClient = new ModbusClientSerial({
                    serial: {
                        portName: serial.comName,
                        baudRate: serial.baudRate || 9600,
                        dataBits: serial.dataBits || 8,
                        stopBits: serial.stopBits || 1,
                        parity: serial.parity || 'none',
                    },
                    logger: logWrapper,
                    timeout: options.config.timeout,
                    unitId: options.config.multiDeviceId ? undefined : options.config.defaultDeviceId,
                });
            } catch (e) {
                adapter.log.error(`Cannot open port "${serial.comName}" [${serial.baudRate || 9600}]: ${e}`);
            }
        } else {
            adapter.log.error(`Unsupported type ${options.config.type as string}"`);
            return;
        }

        if (!this.modbusClient) {
            adapter.log.error('Cannot create modbus master!');
            return;
        }

        this.modbusClient
            .on('connect', () => {
                if (!this.connected) {
                    if (options.config.type === 'tcp') {
                        adapter.log.info(`Connected to slave ${options.config.tcp?.bind}`);
                    } else {
                        adapter.log.info('Connected to slave');
                    }
                    this.connected = true;
                    void this.adapter.setState('info.connection', true, true);
                }

                if (this.nextPoll) {
                    adapter.clearTimeout(this.nextPoll);
                    this.nextPoll = null;
                }

                void this.#poll().catch(err => this.adapter.log.error(err));

                this.keepAliveTimeout && adapter.clearTimeout(this.keepAliveTimeout);
                this.keepAliveTimeout = adapter.setTimeout(() => {
                    this.keepAliveTimeout = undefined;
                    this.#pollBinariesBlockWithKeepAlive();
                }, options.config.keepAliveInterval || 1000);
            })
            .on('disconnect', () => {
                if (this.isStop) {
                    return;
                }

                this.reconnectTimeout ||= adapter.setTimeout(() => this.#reconnect(), 1000);
            });

        this.modbusClient.on('close', () => {
            if (this.isStop) {
                return;
            }

            this.reconnectTimeout = adapter.setTimeout(() => this.#reconnect(), 1000);
        });

        this.modbusClient.on('error', err => {
            if (this.isStop) {
                return;
            }
            if (err.code === 'ECONNREFUSED') {
                adapter.log.warn(`Connection refused ${err.address}:${err.port}`);
            } else {
                adapter.log.warn(`On error: ${JSON.stringify(err)}`);
            }

            this.reconnectTimeout = adapter.setTimeout(() => this.#reconnect(), 1000);
        });

        this.modbusClient.on('trashCurrentRequest', err => {
            if (this.isStop) {
                return;
            }
            adapter.log.warn(`Error: ${JSON.stringify(err)}`);
            this.reconnectTimeout = adapter.setTimeout(() => this.#reconnect(), 1000);
        });
    }

    #waitAsync(ms: number | undefined): Promise<void> {
        if (!ms) {
            return Promise.resolve();
        }
        return new Promise<void>(resolve => this.adapter.setTimeout(resolve, ms));
    }

    #reconnect(isImmediately?: boolean): void {
        if (this.reconnectTimeout) {
            this.adapter.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.nextPoll) {
            this.adapter.clearTimeout(this.nextPoll);
            this.nextPoll = null;
        }
        if (this.keepAliveTimeout) {
            this.adapter.clearTimeout(this.keepAliveTimeout);
            this.keepAliveTimeout = null;
        }

        try {
            this.modbusClient?.close();
        } catch (e) {
            this.adapter.log.error(`Cannot close master: ${e}`);
        }

        if (this.connected) {
            if (this.options.config.tcp) {
                this.adapter.log.info(`Disconnected from slave ${this.options.config.tcp?.bind}`);
            } else {
                this.adapter.log.info('Disconnected from slave');
            }

            this.connected = false;
            void this.adapter.setState('info.connection', false, true);
        }

        this.connectTimer ||= this.adapter.setTimeout(
            () => {
                this.connectTimer = null;
                if (typeof this.modbusClient?.connect === 'function') {
                    this.modbusClient.connect();
                }
            },
            isImmediately ? 1000 : this.options.config.recon!,
        );
    }

    async #pollBinariesBlock(
        device: {
            disInputs: DeviceMasterOption;
            coils: DeviceMasterOption;
            inputRegs: DeviceMasterOption;
            holdingRegs: DeviceMasterOption;
        },
        regType: 'coils' | 'disInputs',
        block: number,
    ): Promise<void> {
        const regs = device[regType];
        const regBlock = regs.blocks[block];

        if (regBlock.startIndex === regBlock.endIndex) {
            regBlock.endIndex++;
        }

        if (this.showDebug) {
            this.adapter.log.debug(
                `[DevID_${regs.deviceId}/${regType}] Poll address ${regBlock.start} - ${regBlock.count} bits`,
            );
        }

        if (this.modbusClient) {
            let response: ModbusReadResultBinary;
            try {
                if (regType === 'disInputs') {
                    response = await this.modbusClient.readDiscreteInputs(
                        regs.deviceId,
                        regBlock.start,
                        regBlock.count,
                    );
                } else {
                    response = await this.modbusClient.readCoils(regs.deviceId, regBlock.start, regBlock.count);
                }
            } catch (err) {
                const errorMsg = `[DevID_${regs.deviceId}/${regType}] Block ${regBlock.start}-${regBlock.start + regBlock.count - 1}: ${JSON.stringify(err)}`;
                this.adapter.log.warn(errorMsg);
                return;
            }
            if (response.data?.length) {
                for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                    const id = regs.config[n].id;
                    const val = response.data[regs.config[n].address - regBlock.start];

                    if (
                        this.options.config.alwaysUpdate ||
                        this.ackObjects[id] === undefined ||
                        this.ackObjects[id].val !== val
                    ) {
                        this.ackObjects[id] = { val };
                        void this.adapter.setState(id, val, true, err => {
                            // analyze if the state could be set (because of permissions)
                            err && this.adapter.log.error(`Can not set state ${id}: ${err}`);
                        });
                    }
                }
            } else {
                this.adapter.log.warn(`Null buffer length for ${regType} ${regBlock.start}`);
            }
        } else {
            this.adapter.log.debug(`Poll canceled, because no connection`);
            throw new Error('No connection');
        }
    }

    #pollBinariesBlockWithKeepAlive(): void {
        if (this.options.config.keepAliveInterval! > 0) {
            if (this.keepAliveTimeout) {
                this.keepAliveTimeout && this.adapter.clearTimeout(this.keepAliveTimeout);
                this.keepAliveTimeout = null;
            }

            if (this.modbusClient) {
                this.modbusClient
                    .readDiscreteInputs(this.deviceIds[0], 0, 1)
                    .then(response => this.adapter.log.silly(`Keep alive response = ${JSON.stringify(response)}`))
                    .catch(() => {});

                this.keepAliveTimeout = this.adapter.setTimeout(() => {
                    this.keepAliveTimeout = null;
                    this.#pollBinariesBlockWithKeepAlive();
                }, this.options.config.keepAliveInterval!);
            } else {
                this.adapter.log.debug(`Poll canceled, because no connection`);
            }
        } else {
            this.adapter.log.silly('Keepalive is disabled!');
        }
    }

    async #pollBinariesBlocks(
        device: {
            disInputs: DeviceMasterOption;
            coils: DeviceMasterOption;
            inputRegs: DeviceMasterOption;
            holdingRegs: DeviceMasterOption;
        },
        regType: 'disInputs' | 'coils',
    ): Promise<void> {
        const regs = device[regType];
        for (let n = 0; n < regs.length; n++) {
            if (this.connected && !this.isStop) {
                await this.#pollBinariesBlock(device, regType, n);
                await this.#waitAsync(this.options.config.readInterval);
            }
        }
    }

    async #pollFloatBlock(
        device: {
            disInputs: DeviceMasterOption;
            coils: DeviceMasterOption;
            inputRegs: DeviceMasterOption;
            holdingRegs: DeviceMasterOption;
        },
        regType: 'inputRegs' | 'holdingRegs',
        block: number,
    ): Promise<void> {
        const regs = device[regType];
        const regBlock = regs.blocks[block];

        if (regBlock.startIndex === regBlock.endIndex) {
            regBlock.endIndex++;
        }
        if (!this.scaleFactors[regs.deviceId]) {
            this.adapter.log.debug('Initialization of scale factors done!');
            this.scaleFactors[regs.deviceId] = {};
        }

        if (this.showDebug) {
            this.adapter.log.debug(
                `[DevID_${regs.deviceId}/${regType}] Poll address ${regBlock.start} - ${regBlock.count} registers`,
            );
        }

        if (this.modbusClient && this.connected && !this.isStop) {
            let response;
            try {
                if (regType === 'inputRegs') {
                    response = await this.modbusClient.readInputRegisters(
                        regs.deviceId,
                        regBlock.start,
                        regBlock.count,
                    );
                } else {
                    response = await this.modbusClient.readHoldingRegisters(
                        regs.deviceId,
                        regBlock.start,
                        regBlock.count,
                    );
                }
                if (this.showDebug) {
                    this.adapter.log.debug(`[DevID_${regs.deviceId}/${regType}] Poll address ${regBlock.start} DONE`);
                }
                if (response.payload?.length) {
                    // first process all the scale factor values inside the block
                    for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                        if (regs.config[n].isScale) {
                            const prefixAddr = `DevID_${device.coils.deviceId}/${regType}/${regs.config[n]._address}`;
                            try {
                                let val = extractValue(
                                    regs.config[n].type,
                                    regs.config[n].len,
                                    response.payload,
                                    regs.config[n].address - regBlock.start,
                                );
                                const formula = regs.config[n].formula;
                                // If value must be calculated with formula
                                if (formula) {
                                    if (this.showDebug) {
                                        this.adapter.log.debug(`[${prefixAddr}] _Input Value = ${val}`);
                                        this.adapter.log.debug(`[${prefixAddr}] _Formula = ${formula}`);
                                    }
                                    try {
                                        const scaleAddress = parseInt(formula.substring(formula.indexOf('sf[') + 4));
                                        if (scaleAddress !== null && !isNaN(scaleAddress)) {
                                            this.adapter.log.warn(
                                                `[${prefixAddr}] Calculation of a scaleFactor which is based on another scaleFactor seems strange. Please check the config for address ${regs.config[n].address} !`,
                                            );
                                        }
                                        // calculate value from formula or report an error
                                        const func = new Function('x', 'sf', `return ${formula}`);
                                        val = func(val, this.scaleFactors[regs.deviceId]);
                                        if (typeof val === 'number') {
                                            val =
                                                Math.round(val * this.options.config.round) / this.options.config.round;
                                        }
                                    } catch (e) {
                                        this.adapter.log.warn(
                                            `[${prefixAddr}] Calculation: eval(${formula}) not possible: ${e}`,
                                        );
                                    }
                                } else if (typeof val === 'number') {
                                    // no formula used, so just scale with factor and offset
                                    val = val * regs.config[n].factor + regs.config[n].offset;
                                    val = Math.round(val * this.options.config.round) / this.options.config.round;
                                }
                                // store the finally calculated value as scaleFactor
                                this.scaleFactors[regs.deviceId][regs.config[n]._address] = val;
                                if (this.showDebug) {
                                    this.adapter.log.debug(
                                        `[${prefixAddr}] Scale factor value stored from this address = ${val}`,
                                    );
                                }
                            } catch (err) {
                                this.adapter.log.error(
                                    `Can not set value for [DevID_${regs.deviceId}]: ${err.message}`,
                                );
                            }
                        }
                    }

                    // now process all values and store to the states
                    for (let n = regBlock.startIndex; n < regBlock.endIndex; n++) {
                        const id = regs.config[n].id;
                        try {
                            let val = extractValue(
                                regs.config[n].type,
                                regs.config[n].len,
                                response.payload,
                                regs.config[n].address - regBlock.start,
                            );
                            // If value must be calculated with formula
                            const prefixAddr = this.showDebug
                                ? `DevID_${device.coils.deviceId}/${regType}/${regs.config[n]._address}`
                                : '';
                            if (regs.config[n].formula) {
                                if (this.showDebug) {
                                    this.adapter.log.debug(`[${prefixAddr}] Input Value = ${val}`);
                                    this.adapter.log.debug(`[${prefixAddr}] Formula = ${regs.config[n].formula}`);
                                }
                                try {
                                    if (this.showDebug) {
                                        // scaleAddress is used only for debug output
                                        const m = regs.config[n].formula!.match(/sf\[(['"`\d]+)]/g);
                                        m?.forEach(sf => {
                                            const num = sf.match(/\d+/);
                                            if (num) {
                                                const scaleAddress = parseInt(num[1]);

                                                if (scaleAddress !== null && !isNaN(scaleAddress)) {
                                                    // it seems that the current formula uses a scaleFactor, therefore check the validity
                                                    if (this.showDebug) {
                                                        this.adapter.log.debug(
                                                            `[${prefixAddr}] Scale factor address is = ${scaleAddress}`,
                                                        );
                                                        this.adapter.log.debug(
                                                            `[${prefixAddr}] Scale factor address is inside current read range = ${scaleAddress > regBlock.start && scaleAddress < regBlock.start + regBlock.count}`,
                                                        );
                                                    }
                                                    // check if the scaleFactor address is in the current read block or outside this block
                                                    if (
                                                        scaleAddress < regBlock.start ||
                                                        scaleAddress > regBlock.start + regBlock.count
                                                    ) {
                                                        // the scaleFactor address is not in the current read block. So it cannot be ensured that the values are in sync / valid
                                                        this.adapter.log.warn(
                                                            `[DevID_${device.coils.deviceId}/${regType}/${regs.config[n]._address}] The current range for reading the values was from address ${regBlock.start} up to address ${regBlock.start + regBlock.count}!`,
                                                        );
                                                        this.adapter.log.warn(
                                                            `[DevID_${device.coils.deviceId}/${regType}/${regs.config[n]._address}] Please make sure to configure the read process that both adresses are read in the same block!`,
                                                        );
                                                        this.adapter.log.warn(
                                                            `[DevID_${device.coils.deviceId}/${regType}/${regs.config[n]._address}] The used scaleFactor from address ${scaleAddress} is not inside the same read block as the parameter on address ${regs.config[n].address}`,
                                                        );
                                                    }
                                                }
                                            }
                                        });
                                    }

                                    // calculate value from formula or report an error
                                    const func = new Function('x', 'sf', `return ${regs.config[n].formula}`);
                                    val = func(val, this.scaleFactors[regs.deviceId]);
                                    if (this.showDebug) {
                                        this.adapter.log.debug(
                                            `[${prefixAddr}] Calculation result = ${val}, type = ${typeof val}`,
                                        );
                                    }
                                    // only do rounding in case the calculation result is a number
                                    if (typeof val === 'number') {
                                        val = Math.round(val * this.options.config.round) / this.options.config.round;
                                    }
                                } catch (e) {
                                    this.adapter.log.warn(
                                        `[DevID_${device.coils.deviceId}/${regType}/${regs.config[n]._address}] Calculation: eval(${regs.config[n].formula}) not possible: ${e}`,
                                    );
                                }
                            } else if (typeof val === 'number') {
                                val = val * regs.config[n].factor + regs.config[n].offset;
                                val = Math.round(val * this.options.config.round) / this.options.config.round;
                            }

                            if (
                                val !== null &&
                                (this.options.config.alwaysUpdate ||
                                    this.ackObjects[id] === undefined ||
                                    this.ackObjects[id].val !== val)
                            ) {
                                this.ackObjects[id] = { val };
                                void this.adapter.setState(
                                    id,
                                    val,
                                    true,
                                    err =>
                                        // analyze if the state could be set (because of permissions)
                                        err && this.adapter.log.error(`Can not set state ${id}: ${err}`),
                                );
                            }
                        } catch (err) {
                            this.adapter.log.error(`Can not set value: ${err.message}`);
                        }
                    }
                } else {
                    this.adapter.log.warn(`Null buffer length for ${regType} ${regBlock.start}`);
                }

                // special case for cyclic write (cw)
                if (this.options.config.maxBlock! < 2 && regs.config[regBlock.startIndex].cw) {
                    // write immediately the current value
                    const fullId = regs.config[regBlock.startIndex].fullId;
                    await this.#writeFloatsReg(fullId);
                }
            } catch (err) {
                const errorMsg = `[DevID_${regs.deviceId}/${regType}] Block ${regBlock.start}-${regBlock.start + regBlock.count - 1}: ${JSON.stringify(err)}`;
                this.adapter.log.warn(errorMsg);
                return;
            }
        } else {
            this.adapter.log.debug(`Poll canceled, because no connection`);
            throw new Error('No connection');
        }
    }

    async #pollFloatsBlocks(
        device: {
            disInputs: DeviceMasterOption;
            coils: DeviceMasterOption;
            inputRegs: DeviceMasterOption;
            holdingRegs: DeviceMasterOption;
        },
        regType: 'inputRegs' | 'holdingRegs',
    ): Promise<void> {
        const regs = device[regType];
        for (let n = 0; n < regs.blocks.length; n++) {
            if (this.connected && !this.isStop) {
                await this.#pollFloatBlock(device, regType, n);
                await this.#waitAsync(this.options.config.readInterval);
            }
        }
    }

    async #writeFloatsReg(fullId: string): Promise<void> {
        const obj = this.objects[fullId];
        if (obj?.native?.len) {
            const id = obj._id.substring(this.adapter.namespace.length + 1);
            if (!this.modbusClient || !this.connected || this.isStop) {
                throw new Error('client disconnected');
            }
            if (this.ackObjects[id]) {
                await this.#writeValue(id, this.ackObjects[id].val);
            }
        }
    }

    async #writeFloatsRegs(device: {
        disInputs: DeviceMasterOption;
        coils: DeviceMasterOption;
        inputRegs: DeviceMasterOption;
        holdingRegs: DeviceMasterOption;
    }): Promise<void> {
        const regs = device.holdingRegs;

        if (regs.cyclicWrite) {
            for (const fullId of regs.cyclicWrite) {
                await this.#writeFloatsReg(fullId);
                await this.#waitAsync(this.options.config.readInterval);
            }
        }
    }

    #pollResult(startTime: number, deviceId: number, err: Error): Error | undefined {
        if (err) {
            this.errorCount++;

            this.adapter.log.warn(
                `[DevID_${deviceId}] Poll error count: ${this.errorCount} code: ${JSON.stringify(err)}`,
            );
            void this.adapter.setState('info.connection', false, true);

            if (this.errorCount > 12 * this.deviceIds.length) {
                // 2 re-connects did not help, restart adapter
                this.adapter.log.error('Reconnect did not help, restart adapter');
                typeof this.adapter.terminate === 'function' ? this.adapter.terminate(156) : process.exit(156);
            } else if (this.errorCount < 6 * this.deviceIds.length && this.connected) {
                // tolerate up to 6 errors per device
                return;
            } else {
                return new Error('disconnect');
            }
        } else {
            const currentPollTime = new Date().valueOf() - startTime;

            if (this.pollTime !== undefined) {
                if (Math.abs(this.pollTime - currentPollTime) > 100) {
                    this.pollTime = currentPollTime;
                    void this.adapter.setState('info.pollTime', currentPollTime, true);
                }
            } else {
                this.pollTime = currentPollTime;
                void this.adapter.setState('info.pollTime', currentPollTime, true);
            }

            if (this.errorCount > 0) {
                void this.adapter.setState('info.connection', true, true);
                this.errorCount = 0;
            }
        }
    }

    async #pollDevice(device: {
        disInputs: DeviceMasterOption;
        coils: DeviceMasterOption;
        inputRegs: DeviceMasterOption;
        holdingRegs: DeviceMasterOption;
    }): Promise<void> {
        this.adapter.log.debug(`[DevID_${device.coils.deviceId}] Poll start ---------------------`);
        const startTime = new Date().valueOf();

        // Track errors from each register type but continue polling
        const pollErrors = [];

        // Poll discrete inputs
        try {
            await this.#pollBinariesBlocks(device, 'disInputs');
        } catch (err) {
            pollErrors.push(err);
        }

        // Poll coils
        try {
            await this.#pollBinariesBlocks(device, 'coils');
        } catch (err) {
            pollErrors.push(err);
        }

        // Poll input registers
        try {
            await this.#pollFloatsBlocks(device, 'inputRegs');
        } catch (err) {
            pollErrors.push(err);
        }

        // Poll holding registers
        try {
            await this.#pollFloatsBlocks(device, 'holdingRegs');
        } catch (err) {
            pollErrors.push(err);
        }

        if (device.holdingRegs.cyclicWrite?.length && this.options.config.maxBlock! >= 2) {
            try {
                await this.#writeFloatsRegs(device);
                await this.#waitAsync(this.options.config.writeInterval);
            } catch (err) {
                pollErrors.push(err);
            }
        }

        if (this.connected && !this.isStop) {
            // If all polls failed, report error, otherwise report success
            const allFailed = pollErrors.length === 4;
            const error = allFailed ? pollErrors[0] : null; // Report first error if all failed
            if (pollErrors.length && pollErrors.length < 4) {
                this.adapter.log.warn(
                    `[DevID_${device.coils.deviceId}] Some register types failed but continuing: ${pollErrors.length}/4 errors`,
                );
            }
            this.#pollResult(startTime, device.coils.deviceId, error);
        }
    }

    async #poll(): Promise<void> {
        let anyError: Error | undefined;
        for (const id of this.deviceIds) {
            try {
                await this.#pollDevice(this.devices[id] as MasterDevice);
            } catch (err) {
                anyError = err;
            }
            await this.#waitAsync(this.options.config.waitTime);
        }
        if (anyError) {
            if (!this.reconnectTimeout) {
                this.#reconnect();
            }
        } else {
            this.nextPoll = this.adapter.setTimeout(() => {
                this.nextPoll = null;
                this.#poll().catch(e => this.adapter.log.error(`Cannot poll: ${e}`));
            }, this.options.config.poll!);
        }
    }

    async #writeValue(id: string, val: ioBroker.StateValue): Promise<void> {
        const obj = this.objects[id];
        if (!obj || !this.modbusClient) {
            return;
        }

        const type: RegisterType = obj.native.regType;

        try {
            if (type === 'coils') {
                if (val === 'true' || val === true) {
                    val = 1;
                }
                if (val === 'false' || val === false) {
                    val = 0;
                }
                val = parseFloat(val as string);

                await this.modbusClient.writeSingleCoil(obj.native.deviceId, obj.native.address, !!val);
            } else if (type === 'holdingRegs') {
                if (obj.native.float === undefined) {
                    obj.native.float =
                        obj.native.type === 'floatle' ||
                        obj.native.type === 'floatbe' ||
                        obj.native.type === 'floatsw' ||
                        obj.native.type === 'doublele' ||
                        obj.native.type === 'doublebe' ||
                        obj.native.type === 'floatsb';
                }

                if (!['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(obj.native.type)) {
                    val = parseFloat(val as string);
                    val = (val - obj.native.offset) / obj.native.factor;
                    if (!obj.native.float) {
                        val = Math.round(val);
                    }
                }
                if (!obj.native.type) {
                    this.adapter.log.error('No type defined for write.');
                    return;
                }
                // FC16
                if (
                    this.options.config.onlyUseWriteMultipleRegisters ||
                    (obj.native.len > 1 && !this.options.config.doNotUseWriteMultipleRegisters)
                ) {
                    const hrBuffer = writeValue(obj.native.type, val as string | number, obj.native.len);

                    await this.modbusClient.writeMultipleRegisters(obj.native.deviceId, obj.native.address, hrBuffer);
                } else {
                    // FC06
                    const buffer = writeValue(obj.native.type, val as number, 1);

                    if (obj.native.len > 1) {
                        for (let r = 0; r < obj.native.len / 2; r++) {
                            const subBuffer = buffer.subarray(r * 2, r * 2 + 2);
                            await this.modbusClient.writeSingleRegister(
                                obj.native.deviceId,
                                obj.native.address + r,
                                subBuffer,
                            );
                            await this.#waitAsync(this.options.config.writeInterval);
                        }
                    } else {
                        await this.modbusClient.writeSingleRegister(obj.native.deviceId, obj.native.address, buffer);
                    }
                }
            }
            if (this.showDebug) {
                this.adapter.log.debug(`Write successfully [${obj.native.address}]: ${val}`);
            }
        } catch (err) {
            this.adapter.log.warn(`Can not write value ${val}: ${err}`);
            if (!this.isStop && !this.reconnectTimeout) {
                this.#reconnect(true);
            }
        }
    }

    async #send(): Promise<void> {
        if (!this.modbusClient) {
            this.adapter.log.error('Client not connected');
            return;
        }

        const id = Object.keys(this.sendBuffer)[0];
        await this.#writeValue(id, this.sendBuffer[id]);

        delete this.sendBuffer[id];

        if (Object.keys(this.sendBuffer).length) {
            this.adapter.setTimeout(() => this.#send(), this.options.config.writeInterval || 0);
        }
    }

    #writeHelper(id: string, state: ioBroker.SettableState): void {
        this.sendBuffer[id] = state.val!;

        if (Object.keys(this.sendBuffer).length === 1) {
            this.#send().catch(e => this.adapter.log.error(`Cannot send: ${e}`));
        }
    }

    async write(id: string, state: ioBroker.State): Promise<void> {
        if (!this.objects[id]?.native) {
            this.adapter.log.error(`Can not set state ${id}: unknown object`);
            return;
        }

        if (this.objects[id].native.regType === 'coils' || this.objects[id].native.regType === 'holdingRegs') {
            if (!this.objects[id].native.wp) {
                this.#writeHelper(id, state);

                // TODO: may be here we should calculate options.config.readInterval too
                await this.#waitAsync(this.options.config.poll! * 1.5);
                const _id = id.substring(this.adapter.namespace.length + 1);

                await this.adapter.setState(id, this.ackObjects[_id] ? this.ackObjects[_id].val : null, true);
            } else {
                if (this.pulseList[id] === undefined) {
                    const _id = id.substring(this.adapter.namespace.length + 1);
                    this.pulseList[id] = this.ackObjects[_id] ? this.ackObjects[_id].val : !state.val;

                    this.#writeHelper(id, state);
                    await this.#waitAsync(this.options.config.pulseTime);
                    this.#writeHelper(id, { val: this.pulseList[id] });

                    await this.#waitAsync(this.options.config.poll! * 1.5);
                    if (this.ackObjects[_id]) {
                        await this.adapter.setState(id, this.ackObjects[_id].val, true);
                    }
                    delete this.pulseList[id];
                }
            }
        } else {
            this.adapter.setTimeout(() => {
                const _id = id.substring(this.adapter.namespace.length + 1);
                void this.adapter.setState(
                    id,
                    this.ackObjects[_id] ? this.ackObjects[_id].val : null,
                    true,
                    err =>
                        // analyse if the state could be set (because of permissions)
                        err && this.adapter.log.error(`Can not set state ${id}: ${err}`),
                );
            }, 0);
        }
    }

    start(): void {
        if (this.modbusClient && typeof this.modbusClient.connect === 'function') {
            try {
                this.modbusClient.connect();
            } catch (e) {
                this.adapter.log.error(`Can not open Modbus connection: ${e} . Please check your settings`);
            }
        }
    }

    close(): void {
        this.isStop = true;
        if (this.reconnectTimeout) {
            this.adapter.clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.connectTimer) {
            this.adapter.clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        if (this.keepAliveTimeout) {
            this.adapter.clearTimeout(this.keepAliveTimeout);
            this.keepAliveTimeout = null;
        }

        if (this.nextPoll) {
            this.adapter.clearTimeout(this.nextPoll);
            this.nextPoll = null;
        }
        if (this.modbusClient) {
            try {
                this.modbusClient.close();
            } catch {
                // ignore
            }
        }
    }
}
