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
export type RegisterType = 'disInputs' | 'coils' | 'inputRegs' | 'holdingRegs';

export interface ModbusAdapterConfig extends ioBroker.AdapterConfig {
    params: {
        type: 'tcp' | 'serial' | 'tcprtu' | 'tcp-ssl';
        bind: string;
        port: number | string;
        comName: string;
        baudRate: number;
        dataBits: number;
        stopBits: number;
        parity: 'none' | 'even' | 'mark' | 'odd' | 'space';
        deviceId: number;
        timeout: number;
        slave: '0' | '1';
        poll: number;
        recon: number;
        keepAliveInterval: number;
        maxBlock: number;
        maxBoolBlock: number;
        multiDeviceId: boolean;
        pulsetime: number;
        waitTime: number;
        disInputsOffset: number;
        coilsOffset: number;
        inputRegsOffset: number;
        holdingRegsOffset: number;
        showAliases: true;
        directAddresses: boolean;
        doNotIncludeAdrInId: boolean;
        preserveDotsInId: boolean;
        round: number;
        doNotRoundAddressToWord: boolean;
        doNotUseWriteMultipleRegisters: boolean;
        onlyUseWriteMultipleRegisters: boolean;
        writeInterval: number;
        readInterval: number;
        disableLogging: boolean;
        certPrivate: string;
        certPublic: string;
        certChained: string;
        sslRejectUnauthorized: true;
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
