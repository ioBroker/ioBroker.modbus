export type RegisterEntryType =
    | ''
    | 'string'
    | 'stringle'
    | 'string16'
    | 'string16le'
    | 'rawhex'
    | 'uint16be'
    | 'uint16le'
    | 'int16be'
    | 'int16le'
    | 'uint8be'
    | 'uint8le'
    | 'int8be'
    | 'int8le'
    | 'uint32be'
    | 'uint32le'
    | 'uint32sw'
    | 'uint32sb'
    | 'int32be'
    | 'int32le'
    | 'int32sw'
    | 'int32sb'
    | 'int64be'
    | 'int64le'
    | 'floatbe'
    | 'floatle'
    | 'floatsw'
    | 'floatsb'
    | 'uint64be'
    | 'uint64le'
    | 'doublebe'
    | 'doublele';

export interface Register {
    address: number;
    _address: string | number;
    deviceId?: string | number;
    name: string;
    description?: string;
    formula?: string;
    role?: string;
    unit?: string;
    room?: string;
    poll?: boolean;
    wp?: boolean;
    rp?: boolean;
    cw?: boolean;
    rc?: boolean;
    len?: number | string;
    type: RegisterEntryType;
    factor?: number | string;
    offset?: number | string;
    isScale?: boolean;
}

export interface RegisterInternal extends Omit<Register, '_address' | 'len' | 'factor' | 'offset'> {
    _address: number;
    id: string;
    fullId: string;
    len: number;
    offset: number;
    factor: number;
}
export type RegisterType = 'disInputs' | 'coils' | 'inputRegs' | 'holdingRegs';
export type ModbusTransport = 'tcp' | 'serial' | 'tcprtu' | 'tcp-ssl';

export interface ModbusAdapterConfig extends ioBroker.AdapterConfig {
    params: {
        type: ModbusTransport;
        bind: string;
        port: number | string;
        comName: string;
        baudRate: number;
        dataBits: 5 | 6 | 7 | 8 | string;
        stopBits: 1 | 2 | string;
        parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
        deviceId?: number | string | null;
        timeout: number | string;
        slave: '0' | '1';
        poll: number | string;
        recon: number | string;
        keepAliveInterval: number | string;
        maxBlock: number | string;
        maxBoolBlock: number | string;
        multiDeviceId: boolean | 'true';
        pulsetime: number | string;
        waitTime: number | string;
        disInputsOffset: number | string;
        coilsOffset: number | string;
        inputRegsOffset: number | string;
        holdingRegsOffset: number | string;
        showAliases: true | 'true';
        directAddresses: boolean | 'true';
        doNotIncludeAdrInId: boolean | 'true';
        preserveDotsInId: boolean | 'true';
        round: number | string;
        alwaysUpdate: boolean;
        doNotRoundAddressToWord: boolean | 'true';
        doNotUseWriteMultipleRegisters: boolean | 'true';
        onlyUseWriteMultipleRegisters: boolean | 'true';
        writeInterval: number | string;
        readInterval: number | string;
        disableLogging: boolean;
        certPrivate: string;
        certPublic: string;
        certChained: string;
        sslRejectUnauthorized?: boolean;
    };
    disInputs: Register[];
    coils: Register[];
    inputRegs: Register[];
    holdingRegs: Register[];
}

export interface OptionField {
    name: keyof ModbusAdapterConfig['params'];
    type: 'checkbox' | 'text' | 'number' | 'select' | 'ports';
    dimension?: string;
    help?: string;
    tooltip?: string;
    title: string;
    options?: { value: string; title: string }[];
    min?: number;
    max?: number;
}

export interface RegisterField {
    name: keyof Register;
    title: string;
    type: string;
    width?: number | string;
    expert?: boolean;
    formulaDisabled?: boolean;
    sorted?: boolean;
    tooltip?: string;
    options?: Array<{ value: string; title: string }>;
}

interface DeviceOption {
    fullIds: string[];
    addressHigh: number;
    addressLow: number;
    length: number;
    offset: number;
    config: RegisterInternal[];
}
export interface DeviceSlaveOption extends DeviceOption {
    changed: boolean;
    values: (number | boolean)[];
    mapping: { [address: number]: string };

    lastStart?: number;
    lastEnd?: number;
}
export interface DeviceMasterOption extends DeviceOption {
    deviceId: number;
    blocks: { start: number; count: number; startIndex: number; endIndex: number }[];
    // IDs of the objects that must be cyclic written
    cyclicWrite?: string[];
}
export type MasterDevice = {
    disInputs:  DeviceMasterOption;
    coils:  DeviceMasterOption;
    inputRegs:  DeviceMasterOption;
    holdingRegs:  DeviceMasterOption;
};
export type SlaveDevice = {
    disInputs: DeviceSlaveOption;
    coils: DeviceSlaveOption;
    inputRegs: DeviceSlaveOption;
    holdingRegs: DeviceSlaveOption;
};

export interface Options {
    config: {
        type: ModbusTransport;
        slave: boolean;
        alwaysUpdate: boolean;
        round: number;
        timeout: number;
        defaultDeviceId: number;
        doNotIncludeAdrInId: boolean;
        preserveDotsInId: boolean;
        writeInterval: number;
        doNotUseWriteMultipleRegisters: boolean;
        onlyUseWriteMultipleRegisters: boolean;
        multiDeviceId?: boolean;

        // Only for master
        poll?: number;
        recon?: number;
        maxBlock?: number;
        maxBoolBlock?: number;
        pulseTime?: number;
        waitTime?: number;
        readInterval?: number;
        keepAliveInterval?: number;
        disableLogging?: boolean;

        tcp?: {
            port: number;
            bind?: string;
        };

        ssl?: {
            rejectUnauthorized: boolean;
            key: string;
            cert: string;
            ca?: string;
        };

        serial?: {
            comName: string;
            baudRate: number;
            dataBits: 5 | 6 | 7 | 8;
            stopBits: 1 | 2;
            parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
        };
    };
    devices: {
        [deviceId: number]: MasterDevice | SlaveDevice;
    };
    objects: { [id: string]: ioBroker.StateObject | null | undefined };
}
