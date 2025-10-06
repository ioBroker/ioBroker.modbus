import { Adapter, type AdapterOptions } from '@iobroker/adapter-core';
import type {
    DeviceMasterOption,
    DeviceSlaveOption,
    ModbusAdapterConfig,
    Options,
    Register,
    RegisterInternal,
    RegisterType,
} from './types';
import { join } from 'node:path';
import { statSync, readdirSync } from 'node:fs';
import type { PortInfo } from '@serialport/bindings-interface';

import { Master } from './lib/Master'; // Get common adapter utils
import Slave from './lib/Slave'; // Get common adapter utils
let serialPortList: (() => Promise<PortInfo[]>) | null = null;

function sortByAddress(a: Register, b: Register): 1 | 0 | -1 {
    const ad = parseFloat(a._address as string);
    const bd = parseFloat(b._address as string);
    return ad < bd ? -1 : ad > bd ? 1 : 0;
}

export class ModbusAdapter extends Adapter {
    declare config: ModbusAdapterConfig;
    private infoRegExp!: RegExp;
    static readonly _rmap: { [bit: number]: number } = {
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
    static readonly _dmap: { [bit: number]: number } = {
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
    private objects: { [id: string]: ioBroker.StateObject | null | undefined } = {};
    private enumObjs: { [enumGroup: string]: { [id: string]: ioBroker.EnumObject } } = {};
    static readonly typeItemsLen: { [type: string]: number } = {
        uint8be: 1,
        uint8le: 1,
        int8be: 1,
        int8le: 1,
        uint16be: 1,
        uint16le: 1,
        int16be: 1,
        int16le: 1,
        int16be1: 1,
        int16le1: 1,
        uint32be: 2,
        uint32le: 2,
        uint32sw: 2,
        uint32sb: 2,
        int32be: 2,
        int32le: 2,
        int32sw: 2,
        int32sb: 2,
        uint64be: 4,
        uint64le: 4,
        int64be: 4,
        int64le: 4,
        floatbe: 2,
        floatle: 2,
        floatsw: 2,
        floatsb: 2,
        doublebe: 4,
        doublele: 4,
        string: 0,
        stringle: 0,
        string16: 0,
        string16le: 0,
        rawhex: 0,
    };
    modbus: Master | Slave | null = null;

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'modbus',
            ready: () => {
                try {
                    import('serialport')
                        .then(s => {
                            serialPortList = s.SerialPort.list;
                        })
                        .catch(err => this.log.warn(`Serial is not available: ${err}`))
                        .finally(() => this.main());
                } catch (err) {
                    this.log.warn(`Serial is not available: ${err}`);
                }
            },
            message: (obj: ioBroker.Message) => this.processMessage(obj),
            stateChange: async (id: string, state: ioBroker.State | null | undefined): Promise<void> => {
                if (state && !state.ack && id && !this.infoRegExp.test(id)) {
                    if (!this.modbus) {
                        this.log.warn('No connection');
                    } else {
                        this.log.debug(`state Changed ack=false: ${id}: ${JSON.stringify(state)}`);
                        if (!this.objects[id]) {
                            const obj = await this.getObjectAsync(id);
                            if (obj) {
                                this.objects[id] = obj as ioBroker.StateObject;
                            }
                        }
                        if (this.objects[id]) {
                            this.modbus?.write(id, state).catch(err => this.log.error(err));
                        } else {
                            this.log.warn(`State ${id} not found`);
                        }
                    }
                }
            },
            unload: (callback: () => void): void => this.stopAdapter(callback),
        });

        process.on('SIGINT', () => this.stopAdapter());
    }

    processMessage(obj: ioBroker.Message): void {
        if (obj) {
            switch (obj.command) {
                case 'listUart':
                    if (obj.callback) {
                        if (serialPortList) {
                            // read all found serial ports
                            serialPortList()
                                .then(ports => {
                                    const result = this.listSerial(ports);
                                    this.log.info(`List of port: ${JSON.stringify(result)}`);
                                    this.sendTo(obj.from, obj.command, result, obj.callback);
                                })
                                .catch((err: Error) => {
                                    this.log.warn(`Can not get Serial port list: ${err}`);
                                    this.sendTo(obj.from, obj.command, [{ path: 'Not available' }], obj.callback);
                                });
                        } else {
                            this.log.warn('Module serialport is not available');
                            this.sendTo(obj.from, obj.command, [{ path: 'Not available' }], obj.callback);
                        }
                    }
                    break;
            }
        }
    }

    stopAdapter(callback?: () => void): void {
        if (this.modbus) {
            this.modbus.close();
            this.modbus = null;
        }

        if (this.setState && this.config?.params) {
            void this.setState('info.connection', this.config.params.slave ? '' : false, true);
        }

        void this.getForeignStatesAsync(`${this.namespace}.info.clients.*`).then(async allStates => {
            for (const id in allStates) {
                if (allStates[id]?.val) {
                    await this.setStateAsync(id, false, true);
                }
            }
            if (typeof callback === 'function') {
                return void callback();
            }

            this.terminate ? this.terminate() : process.exit();
        });
    }

    static filterSerialPorts(path: string): boolean {
        // get only serial port names
        if (!/(tty(S|ACM|USB|AMA|MFD|XR)|rfcomm)/.test(path)) {
            return false;
        }
        return statSync(path).isCharacterDevice();
    }

    listSerial(ports: PortInfo[]): { path: string }[] | undefined {
        ports ||= [];

        // Filter out the devices that aren't serial ports
        const devDirName = '/dev';

        let result: { path: string }[] | undefined;
        try {
            this.log.info(`Verify ${JSON.stringify(ports)}`);
            result = readdirSync(devDirName)
                .map(file => join(devDirName, file))
                .filter(path => ModbusAdapter.filterSerialPorts(path))
                .map(port => {
                    if (!ports.find(p => p.path === port)) {
                        ports.push({ path: port } as PortInfo);
                    }

                    return { path: port };
                });
        } catch (e) {
            if (require('node:os').platform() !== 'win32') {
                this.log.error(`Cannot read "${devDirName}": ${e}`);
            }
            result = ports;
        }
        return result;
    }

    async addToEnum(enumName: string, id: string): Promise<void> {
        const obj = await this.getForeignObjectAsync(enumName);
        if (obj?.common?.members && !obj.common.members.includes(id)) {
            obj.common.members.push(id);
            obj.common.members.sort();
            await this.setForeignObjectAsync(obj._id, obj);
        }
    }

    async removeFromEnum(enumName: string, id: string): Promise<void> {
        const obj = await this.getForeignObjectAsync(enumName);
        if (obj?.common?.members) {
            const pos = obj.common.members.indexOf(id);
            if (pos !== -1) {
                obj.common.members.splice(pos, 1);
                await this.setForeignObjectAsync(obj._id, obj);
            }
        }
    }

    async syncEnums(enumGroup: 'rooms', id: string, newEnumName: string): Promise<void> {
        if (!this.enumObjs[enumGroup]) {
            const _enums = await this.getEnumAsync(enumGroup);
            if (_enums) {
                this.enumObjs[enumGroup] = _enums.result;
            }
            return;
        }

        // try to find this id in enums
        let found = false;
        for (const e in this.enumObjs[enumGroup]) {
            if (
                Object.prototype.hasOwnProperty.call(this.enumObjs[enumGroup], e) &&
                this.enumObjs[enumGroup][e].common?.members?.includes(id)
            ) {
                if (this.enumObjs[enumGroup][e]._id !== newEnumName) {
                    await this.removeFromEnum(this.enumObjs[enumGroup][e]._id, id);
                } else {
                    found = true;
                }
            }
        }
        if (!found && newEnumName) {
            await this.addToEnum(newEnumName, id);
        }
    }

    static address2alias(id: RegisterType, address: number | string, isDirect: boolean, offset: number): number {
        if (typeof address === 'string') {
            address = parseInt(address, 10);
        }

        if (id === 'disInputs' || id === 'coils') {
            address =
                ((address >> 4) << 4) +
                (isDirect ? ModbusAdapter._dmap[address % 16] : ModbusAdapter._rmap[address % 16]);
            address += offset;
            return address;
        }
        return address + offset;
    }

    async createExtendObject(id: string, objData: ioBroker.StateObject | ioBroker.ChannelObject): Promise<void> {
        const oldObj = await this.getObjectAsync(id);
        if (oldObj) {
            await this.extendObjectAsync(id, objData);
        } else {
            await this.setObjectNotExistsAsync(id, objData);
        }
    }

    async processTasks(
        tasks: (
            | { name: 'add'; id: string; obj: ioBroker.StateObject | ioBroker.ChannelObject }
            | { name: 'del'; id: string }
            | { name: 'syncEnums'; id: string; newName: string }
        )[],
    ): Promise<void> {
        if (!tasks?.length) {
            return;
        }
        for (const task of tasks) {
            try {
                if (task.name === 'add') {
                    await this.createExtendObject(task.id, task.obj);
                } else if (task.name === 'del') {
                    await this.delObjectAsync(task.id);
                } else if (task.name === 'syncEnums') {
                    await this.syncEnums('rooms', task.id, task.newName);
                } else {
                    this.log.error(`Unknown task: ${JSON.stringify(task)}`);
                }
            } catch (err) {
                this.log.info(`Can not execute task ${task.name} for ID ${task.id}: ${err.message}`);
            }
        }
    }

    prepareConfig(): Options {
        const params = this.config.params;

        const options: Options = {
            config: {
                type: params.type || 'tcp',
                slave: params.slave === '1',
                alwaysUpdate: params.alwaysUpdate,
                round: parseInt(params.round as string, 10) || 0,
                timeout: parseInt(params.timeout as string, 10) || 5000,
                defaultDeviceId:
                    params.deviceId === undefined || params.deviceId === null
                        ? 1
                        : parseInt(params.deviceId as string, 10) || 0,
                doNotIncludeAdrInId: params.doNotIncludeAdrInId === true || params.doNotIncludeAdrInId === 'true',
                preserveDotsInId: params.preserveDotsInId === true || params.preserveDotsInId === 'true',
                writeInterval: parseInt(params.writeInterval as string, 10) || 0,
                doNotUseWriteMultipleRegisters:
                    params.doNotUseWriteMultipleRegisters === true || params.doNotUseWriteMultipleRegisters === 'true',
                onlyUseWriteMultipleRegisters:
                    params.onlyUseWriteMultipleRegisters === true || params.onlyUseWriteMultipleRegisters === 'true',
            },
            devices: {},
            objects: this.objects,
        };

        options.config.round = Math.pow(10, options.config.round);

        if (!options.config.slave) {
            options.config.multiDeviceId = params.multiDeviceId === true || params.multiDeviceId === 'true';
        }

        const deviceIds: number[] = [];
        this.checkDeviceIds(options, this.config.disInputs, deviceIds);
        this.checkDeviceIds(options, this.config.coils, deviceIds);
        this.checkDeviceIds(options, this.config.inputRegs, deviceIds);
        this.checkDeviceIds(options, this.config.holdingRegs, deviceIds);
        deviceIds.sort((a, b) => a - b);

        // settings for master
        if (!options.config.slave) {
            options.config.poll = parseInt(params.poll as string, 10) || 1000; // default is 1 second
            options.config.recon = parseInt(params.recon as string, 10) || 60000;
            if (options.config.recon < 1000) {
                this.log.info(`Slave Reconnect time set to 1000ms because was too small (${options.config.recon})`);
                options.config.recon = 1000;
            }
            options.config.maxBlock = parseInt(params.maxBlock as string, 10) || 100;
            options.config.maxBoolBlock = parseInt(params.maxBoolBlock as string, 10) || 128;
            options.config.pulseTime = parseInt(params.pulsetime as string) || 1000;
            options.config.waitTime = params.waitTime === undefined ? 50 : parseInt(params.waitTime as string, 10) || 0;
            options.config.readInterval = parseInt(params.readInterval as string, 10) || 0;
            options.config.keepAliveInterval = parseInt(params.keepAliveInterval as string, 10) || 0;
        }

        options.config.disableLogging = params.disableLogging;

        if (params.type === 'tcp' || params.type === 'tcprtu' || params.type === 'tcp-ssl') {
            options.config.tcp = {
                port: parseInt(params.port as string, 10) || 502,
                bind: params.bind,
            };

            // Add SSL configuration for tcp-ssl type
            if (params.type === 'tcp-ssl') {
                options.config.ssl = {
                    rejectUnauthorized: params.sslRejectUnauthorized !== false,
                    key: params.certPrivate,
                    cert: params.certPublic,
                    ca: params.certChained,
                };
            }
        } else {
            options.config.serial = {
                comName: params.comName,
                baudRate: params.baudRate,
                dataBits: parseInt(params.dataBits as string, 10) as 5 | 6 | 7 | 8,
                stopBits: parseInt(params.stopBits as string, 10) as 1 | 2,
                parity: params.parity,
            };
        }

        for (let d = 0; d < deviceIds.length; d++) {
            const deviceId = deviceIds[d];
            if (options.config.slave) {
                options.devices[deviceId] = {
                    disInputs: {
                        fullIds: [],
                        changed: true,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        config: [],
                        values: [],
                        mapping: {},
                        offset: parseInt(params.disInputsOffset as string, 10),
                    },
                    coils: {
                        fullIds: [],
                        changed: true,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        config: [],
                        values: [],
                        mapping: {},
                        offset: parseInt(params.coilsOffset as string, 10),
                    },

                    inputRegs: {
                        fullIds: [],
                        config: [],
                        changed: true,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        values: [],
                        mapping: {},
                        offset: parseInt(params.inputRegsOffset as string, 10),
                    },
                    holdingRegs: {
                        fullIds: [],
                        config: [],
                        changed: true,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        values: [],
                        mapping: {},
                        offset: parseInt(params.holdingRegsOffset as string, 10),
                    },
                };
            } else {
                options.devices[deviceId] = {
                    disInputs: {
                        fullIds: [],
                        deviceId,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        config: [],
                        blocks: [],
                        offset: parseInt(params.disInputsOffset as string, 10),
                    },

                    coils: {
                        fullIds: [],
                        deviceId,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        config: [],
                        blocks: [],
                        cyclicWrite: [], // only holdingRegs and coils
                        offset: parseInt(params.coilsOffset as string, 10),
                    },

                    inputRegs: {
                        fullIds: [],
                        deviceId,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        config: [],
                        blocks: [],
                        offset: parseInt(params.inputRegsOffset as string, 10),
                    },

                    holdingRegs: {
                        fullIds: [],
                        deviceId,
                        addressLow: 0,
                        addressHigh: 0,
                        length: 0,
                        config: [],
                        blocks: [],
                        cyclicWrite: [], // only holdingRegs and coils
                        offset: parseInt(params.holdingRegsOffset as string, 10),
                    },
                };
            }
        }

        return options;
    }

    checkDeviceIds(options: Options, config: Register[], deviceIds: number[]): void {
        for (let i = config.length - 1; i >= 0; i--) {
            config[i].deviceId = !options.config.multiDeviceId
                ? options.config.defaultDeviceId
                : config[i].deviceId !== undefined
                  ? parseInt(config[i].deviceId as string, 10)
                  : options.config.defaultDeviceId;

            if (isNaN(config[i].deviceId as number)) {
                config[i].deviceId = options.config.defaultDeviceId;
            }

            if (!deviceIds.includes(config[i].deviceId as number)) {
                deviceIds.push(config[i].deviceId as number);
            }
        }
    }

    checkObjects(
        regType: RegisterType,
        regName: string,
        regFullName: string,
        tasks: (
            | { name: 'add'; id: string; obj: ioBroker.StateObject | ioBroker.ChannelObject }
            | { name: 'del'; id: string }
            | { name: 'syncEnums'; id: string; newName: string }
        )[],
        newObjects: string[],
        deviceId: number,
    ): void {
        const regs = this.config[regType] as RegisterInternal[];

        this.log.debug(`Initialize Objects for ${regType}: ${JSON.stringify(regs)}`);

        for (let i = 0; regs.length > i; i++) {
            if (regs[i].deviceId !== deviceId) {
                continue;
            }

            const id = `${this.namespace}.${regs[i].id || i}`;
            regs[i].fullId = id;
            this.objects[id] = {
                _id: regs[i].id,
                type: 'state',
                common: {
                    name: regs[i].description || '',
                    role: regs[i].role || '',
                    type:
                        regType === 'coils' || regType === 'disInputs'
                            ? 'boolean'
                            : ['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(regs[i].type)
                              ? 'string'
                              : 'number',
                    read: true,
                    write: !!this.config.params.slave || regType === 'coils' || regType === 'holdingRegs',
                    def:
                        regType === 'coils' || regType === 'disInputs'
                            ? false
                            : ['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(regs[i].type)
                              ? ''
                              : 0,
                },
                native: {
                    regType: regType,
                    address: regs[i].address,
                    deviceId: regs[i].deviceId,
                },
            };

            if (this.objects[id]) {
                if (regType === 'coils') {
                    this.objects[id].native.poll = regs[i].poll;
                    this.objects[id].common.read = !!regs[i].poll;
                    this.objects[id].native.wp = !!regs[i].wp;
                } else if (regType === 'inputRegs' || regType === 'holdingRegs') {
                    this.objects[id].common.unit = regs[i].unit || '';

                    this.objects[id].native.type = regs[i].type;
                    this.objects[id].native.len = regs[i].len;
                    this.objects[id].native.offset = regs[i].offset;
                    this.objects[id].native.factor = regs[i].factor;
                    if (regType === 'holdingRegs') {
                        this.objects[id].native.poll = regs[i].poll;
                        this.objects[id].common.read = !!regs[i].poll;
                    }
                }
            }

            if (!regs[i].id) {
                this.log.error(`Invalid data ${regName}/${i}: ${JSON.stringify(regs[i])}`);
                this.log.error(`Invalid object: ${JSON.stringify(this.objects[id])}`);
            }

            tasks.push({
                id: regs[i].id,
                name: 'add',
                obj: this.objects[id],
            });
            tasks.push({
                id,
                name: 'syncEnums',
                newName: regs[i].room || '',
            });
            newObjects.push(id);
            this.log.debug(`Add ${regs[i].id}: ${JSON.stringify(this.objects[id])}`);
        }

        if (regs.length) {
            tasks.push({
                id: regName,
                name: 'add',
                obj: {
                    type: 'channel',
                    common: {
                        name: regFullName,
                    },
                    native: {},
                } as ioBroker.ChannelObject,
            });
        }
    }

    assignIds(
        deviceId: number,
        config: RegisterInternal[],
        result: DeviceSlaveOption | DeviceMasterOption,
        regName: string,
        regType: RegisterType,
        localOptions: {
            multiDeviceId?: boolean;
            showAliases: boolean;
            doNotRoundAddressToWord: boolean;
            directAddresses: boolean;
            maxBlock?: number;
            maxBoolBlock?: number;
            doNotIncludeAdrInId: boolean;
            preserveDotsInId: boolean;
        },
    ): void {
        for (let i = config.length - 1; i >= 0; i--) {
            if (config[i].deviceId !== deviceId) {
                continue;
            }

            if (config[i].address === undefined && config[i]._address !== undefined) {
                if (localOptions.showAliases) {
                    if (config[i]._address >= result.offset) {
                        config[i].address = config[i]._address - result.offset;

                        if (localOptions.directAddresses && (regType === 'disInputs' || regType === 'coils')) {
                            const address = config[i].address;
                            config[i].address = ((address >> 4) << 4) + ModbusAdapter._dmap[address % 16];
                        }
                    }
                } else {
                    config[i].address = config[i]._address;
                }
            }
            config[i].address = parseInt(config[i].address as unknown as string, 10);
            const address = config[i].address;

            if (address < 0) {
                continue;
            }

            if (localOptions.multiDeviceId) {
                config[i].id = `${regName}.${deviceId}.`;
            } else {
                config[i].id = `${regName}.`;
            }

            if (localOptions.showAliases) {
                config[i].id += ModbusAdapter.address2alias(
                    regType,
                    address,
                    localOptions.directAddresses,
                    result.offset,
                );
            } else if (!localOptions.doNotIncludeAdrInId || !config[i].name) {
                // add address if not disabled or name not empty
                config[i].id += address;
                if (localOptions.preserveDotsInId) {
                    config[i].id += '_';
                }
            }

            if (localOptions.preserveDotsInId) {
                // preserve dots in name and add to ID
                config[i].id += config[i].name ? config[i].name.replace(/\s/g, '_') : '';
            } else {
                // replace dots by underlines and add to ID
                if (localOptions.doNotIncludeAdrInId) {
                    // It must be so, because of the bug https://github.com/ioBroker/ioBroker.modbus/issues/473
                    // config[i].id += config[i].name ? config[i].name.replace(/\./g, '_').replace(/\s/g, '_') : '';

                    // But because of breaking change
                    config[i].id += config[i].name ? `_${config[i].name.replace(/\./g, '_').replace(/\s/g, '_')}` : '';
                } else {
                    config[i].id += config[i].name ? `_${config[i].name.replace(/\./g, '_').replace(/\s/g, '_')}` : '';
                }
            }
            if (config[i].id.endsWith('.')) {
                config[i].id += config[i].id.substring(0, config[i].id.length - 1);
            }
        }
    }

    // localOptions = {
    //      multiDeviceId
    //      showAliases
    //      doNotRoundAddressToWord
    //      directAddresses
    //      isSlave
    //      maxBlock
    //      maxBoolBlock
    // };
    iterateAddresses(
        isBools: boolean,
        deviceId: number,
        result: DeviceSlaveOption | DeviceMasterOption,
        regName: string,
        regType: RegisterType,
        localOptions: {
            multiDeviceId?: boolean;
            showAliases: boolean;
            doNotRoundAddressToWord: boolean;
            directAddresses: boolean;
            maxBlock?: number;
            maxBoolBlock?: number;
            doNotIncludeAdrInId: boolean;
            preserveDotsInId: boolean;
        },
    ): void {
        const config = result.config;

        if (config?.length) {
            result.addressLow = 0xffffffff;
            result.addressHigh = 0;

            for (let i = config.length - 1; i >= 0; i--) {
                if (config[i].deviceId !== deviceId) {
                    continue;
                }
                config[i].address = parseInt(config[i].address as unknown as string, 10);
                const address = config[i].address;

                if (address < 0) {
                    this.log.error(`Invalid ${regName} address: ${address}`);
                    config.splice(i, 1);
                    continue;
                }

                if (!isBools) {
                    config[i].type ||= 'uint16be';
                    let offset = config[i].offset as any;
                    if (typeof offset === 'string') {
                        offset = offset.replace(',', '.');
                        config[i].offset = parseFloat(offset) || 0;
                    } else if (typeof offset !== 'number') {
                        config[i].offset = 0;
                    } else {
                        config[i].offset = offset || 0;
                    }
                    let factor: number | string = config[i].factor as any;
                    if (typeof factor === 'string') {
                        factor = factor.replace(',', '.');
                        config[i].factor = parseFloat(factor) || 1;
                    } else if (typeof factor !== 'number') {
                        config[i].factor = 1;
                    } else {
                        config[i].factor = factor || 1;
                    }
                    if (['string', 'stringle', 'string16', 'string16le', 'rawhex'].includes(config[i].type)) {
                        config[i].len = parseInt(config[i].len as unknown as string, 10) || 1;
                    } else {
                        config[i].len = ModbusAdapter.typeItemsLen[config[i].type];
                    }
                    config[i].len ||= 1;
                } else {
                    config[i].len = 1;
                }

                // collect cyclic write registers
                if (config[i].cw && Array.isArray((result as DeviceMasterOption).cyclicWrite)) {
                    (result as DeviceMasterOption).cyclicWrite!.push(`${this.namespace}.${config[i].id}`);
                }

                if (address < result.addressLow) {
                    result.addressLow = address;
                }
                if (address + config[i].len > result.addressHigh) {
                    result.addressHigh = address + config[i].len;
                }
            }

            const maxBlock = isBools ? localOptions.maxBoolBlock! : localOptions.maxBlock!;
            let lastAddress = null;
            let startIndex = 0;
            let blockStart = 0;
            let i;
            for (i = 0; i < config.length; i++) {
                if (config[i].deviceId !== deviceId) {
                    continue;
                }

                if (lastAddress === null) {
                    startIndex = i;
                    blockStart = config[i].address;
                    lastAddress = blockStart + config[i].len;
                }

                // try to detect the next block
                if ((result as DeviceMasterOption).blocks) {
                    const blocks = (result as DeviceMasterOption).blocks;
                    const wouldExceedLimit = config[i].address + config[i].len - blockStart > maxBlock;
                    const hasAddressGap = config[i].address - lastAddress > 10 && config[i].len < 10;

                    if (hasAddressGap || wouldExceedLimit) {
                        if (!blocks.map(obj => obj.start).includes(blockStart)) {
                            blocks.push({
                                start: blockStart,
                                count: lastAddress - blockStart,
                                startIndex: startIndex,
                                endIndex: i,
                            });
                        }
                        blockStart = config[i].address;
                        startIndex = i;
                    }
                }
                lastAddress = config[i].address + config[i].len;
            }
            if (
                lastAddress &&
                lastAddress - blockStart &&
                (result as DeviceMasterOption).blocks &&
                !(result as DeviceMasterOption).blocks.map(obj => obj.start).includes(blockStart)
            ) {
                (result as DeviceMasterOption).blocks.push({
                    start: blockStart,
                    count: lastAddress - blockStart,
                    startIndex: startIndex,
                    endIndex: i,
                });
            }

            if (config.length) {
                result.length = result.addressHigh - result.addressLow;
                if (isBools && !localOptions.doNotRoundAddressToWord) {
                    const oldStart = result.addressLow;

                    // align addresses to 16 bit. E.g. 30 => 16, 31 => 16, 32 => 32
                    result.addressLow = (result.addressLow >> 4) << 4;

                    // increase the length on the alignment if any
                    result.length += oldStart - result.addressLow;

                    // If the length is not a multiple of 16
                    if (result.length % 16) {
                        // then round it up to the next multiple of 16
                        result.length = ((result.length >> 4) + 1) << 4;
                    }

                    if ((result as DeviceMasterOption).blocks) {
                        const blocks = (result as DeviceMasterOption).blocks;
                        for (let b = 0; b < blocks.length; b++) {
                            const _oldStart = blocks[b].start;

                            // align addresses to 16 bit. E.g 30 => 16, 31 => 16, 32 => 32
                            blocks[b].start = (blocks[b].start >> 4) << 4;

                            // increase the length on the alignment if any
                            blocks[b].count += _oldStart - blocks[b].start;

                            if (blocks[b].count % 16) {
                                blocks[b].count = ((blocks[b].count >> 4) + 1) << 4;
                            }
                        }
                    }
                }
            } else {
                result.length = 0;
            }

            if ((result as DeviceSlaveOption).mapping) {
                for (let i = 0; i < config.length; i++) {
                    this.log.debug(
                        `Iterate ${regType} ${regName}: ${config[i].address - result.addressLow} = ${config[i].id}`,
                    );
                    (result as DeviceSlaveOption).mapping[config[i].address - result.addressLow] =
                        `${this.namespace}.${config[i].id}`;
                }
            }
        }
    }

    async parseConfig(): Promise<Options> {
        const options = this.prepareConfig();
        const params = this.config.params;

        // not for master or slave
        const localOptions: {
            multiDeviceId?: boolean;
            showAliases: boolean;
            doNotRoundAddressToWord: boolean;
            directAddresses: boolean;
            maxBlock?: number;
            maxBoolBlock?: number;
            doNotIncludeAdrInId: boolean;
            preserveDotsInId: boolean;
        } = {
            multiDeviceId: options.config.multiDeviceId,
            showAliases: params.showAliases === true || params.showAliases === 'true',
            doNotRoundAddressToWord:
                params.doNotRoundAddressToWord === true || params.doNotRoundAddressToWord === 'true',
            directAddresses: params.directAddresses === true || params.directAddresses === 'true',
            maxBlock: options.config.maxBlock,
            maxBoolBlock: options.config.maxBoolBlock,
            doNotIncludeAdrInId: params.doNotIncludeAdrInId === true || params.doNotIncludeAdrInId === 'true',
            preserveDotsInId: params.preserveDotsInId === true || params.preserveDotsInId === 'true',
        };

        const oldObjects = await this.getForeignObjects(`${this.namespace}.*`);
        const newObjects = [];

        this.config.disInputs.sort(sortByAddress);
        this.config.coils.sort(sortByAddress);
        this.config.inputRegs.sort(sortByAddress);
        this.config.holdingRegs.sort(sortByAddress);

        const tasks: (
            | { name: 'add'; id: string; obj: ioBroker.StateObject | ioBroker.ChannelObject }
            | { name: 'del'; id: string }
            | { name: 'syncEnums'; id: string; newName: string }
        )[] = [];

        for (const _deviceId in options.devices) {
            if (!Object.prototype.hasOwnProperty.call(options.devices, _deviceId)) {
                continue;
            }
            const device = options.devices[_deviceId];
            const deviceId = parseInt(_deviceId, 10);

            // Discrete inputs
            this.assignIds(
                deviceId,
                this.config.disInputs as RegisterInternal[],
                device.disInputs,
                'discreteInputs',
                'disInputs',
                localOptions,
            );
            this.assignIds(
                deviceId,
                this.config.coils as RegisterInternal[],
                device.coils,
                'coils',
                'coils',
                localOptions,
            );
            this.assignIds(
                deviceId,
                this.config.inputRegs as RegisterInternal[],
                device.inputRegs,
                'inputRegisters',
                'inputRegs',
                localOptions,
            );
            this.assignIds(
                deviceId,
                this.config.holdingRegs as RegisterInternal[],
                device.holdingRegs,
                'holdingRegisters',
                'holdingRegs',
                localOptions,
            );

            device.disInputs.config = (this.config.disInputs as RegisterInternal[]).filter(
                e => e.deviceId === deviceId,
            );
            device.coils.config = (this.config.coils as RegisterInternal[]).filter(
                e => e.poll && e.deviceId === deviceId,
            );
            device.inputRegs.config = (this.config.inputRegs as RegisterInternal[]).filter(
                e => e.deviceId === deviceId,
            );
            device.holdingRegs.config = (this.config.holdingRegs as RegisterInternal[]).filter(
                e => e.poll && e.deviceId === deviceId,
            );

            // ----------- remember poll values --------------------------
            if (!options.config.slave) {
                tasks.push({
                    id: 'info.pollTime',
                    name: 'add',
                    obj: {
                        type: 'state',
                        common: {
                            name: 'Poll time',
                            type: 'number',
                            role: '',
                            write: false,
                            read: true,
                            def: 0,
                            unit: 'ms',
                        },
                        native: {},
                    } as ioBroker.StateObject,
                });
                newObjects.push(`${this.namespace}.info.pollTime`);
            }

            // Discrete inputs
            this.iterateAddresses(true, deviceId, device.disInputs, 'discreteInputs', 'disInputs', localOptions);
            this.iterateAddresses(true, deviceId, device.coils, 'coils', 'coils', localOptions);
            this.iterateAddresses(false, deviceId, device.inputRegs, 'inputRegisters', 'inputRegs', localOptions);
            this.iterateAddresses(false, deviceId, device.holdingRegs, 'holdingRegisters', 'holdingRegs', localOptions);

            // ------------- create states and objects ----------------------------
            this.checkObjects('disInputs', 'discreteInputs', 'Discrete inputs', tasks, newObjects, deviceId);
            this.checkObjects('coils', 'coils', 'Coils', tasks, newObjects, deviceId);
            this.checkObjects('inputRegs', 'inputRegisters', 'Input registers', tasks, newObjects, deviceId);
            this.checkObjects('holdingRegs', 'holdingRegisters', 'Holding registers', tasks, newObjects, deviceId);

            if (options.config.slave) {
                device.disInputs.fullIds = this.config.disInputs
                    .filter(e => e.deviceId === deviceId)
                    .map(e => (e as RegisterInternal).fullId);
                device.coils.fullIds = this.config.coils
                    .filter(e => e.deviceId === deviceId)
                    .map(e => (e as RegisterInternal).fullId);
                device.inputRegs.fullIds = this.config.inputRegs
                    .filter(e => (e as RegisterInternal).deviceId === deviceId)
                    .map(e => (e as RegisterInternal).fullId);
                device.holdingRegs.fullIds = this.config.holdingRegs
                    .filter(e => e.deviceId === deviceId)
                    .map(e => (e as RegisterInternal).fullId);
            }

            if (!options.config.multiDeviceId) {
                break;
            }
        }

        tasks.push({
            id: 'info',
            name: 'add',
            obj: {
                type: 'channel',
                common: {
                    name: 'info',
                },
                native: {},
            } as ioBroker.ChannelObject,
        });

        // create/ update 'info.connection' object
        let obj = await this.getObjectAsync('info.connection');
        if (!obj) {
            obj = {
                type: 'state',
                common: {
                    name: options.config.slave ? 'IPs of connected partners' : 'If connected to slave',
                    role: 'indicator.connected',
                    write: false,
                    read: true,
                    type: options.config.slave ? 'string' : 'boolean',
                    def: options.config.slave ? '' : false,
                },
                native: {},
            } as ioBroker.StateObject;
            await this.setObjectAsync('info.connection', obj);
        } else if (options.config.slave && obj.common.type !== 'string') {
            obj.common.type = 'string';
            obj.common.name = 'Connected masters';
            obj.common.def = '';
            await this.setObjectAsync('info.connection', obj);
        } else if (!options.config.slave && obj.common.type !== 'boolean') {
            obj.common.type = 'boolean';
            obj.common.name = 'If connected to slave';
            obj.common.def = false;
            await this.setObjectAsync('info.connection', obj);
        }
        await this.setStateAsync('info.connection', this.config.params.slave ? '' : false, true);

        newObjects.push(`${this.namespace}.info.connection`);

        // clear unused states
        for (const id_ in oldObjects) {
            if (
                Object.prototype.hasOwnProperty.call(oldObjects, id_) &&
                !newObjects.includes(id_) &&
                !id_.startsWith(`${this.namespace}.info.clients.`)
            ) {
                this.log.debug(`Remove old object ${id_}`);
                tasks.push({
                    id: id_,
                    name: 'del',
                });
            }
        }

        await this.processTasks(tasks);
        this.subscribeStates('*');
        return options;
    }

    async main(): Promise<void> {
        this.infoRegExp = new RegExp(`${this.namespace.replace('.', '\\.')}\\.info\\.`);
        const options = await this.parseConfig();
        if (options.config.slave) {
            this.modbus = new Slave(options, this);
        } else {
            this.modbus = new Master(options, this);
        }
        this.modbus.start();
    }
}

// If started as allInOne mode => return function to create instance
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new ModbusAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new ModbusAdapter())();
}
