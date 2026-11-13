import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { tsv2json } from 'tsv-json';

import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormLabel,
    InputLabel,
    LinearProgress,
    Link,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Check as CheckIcon,
    Clear as ClearIcon,
    OpenInNew as OpenInNewIcon,
    TravelExplore as DetectIcon,
} from '@mui/icons-material';

import { I18n, IconRefresh, IconResult, type AdminConnection } from '@iobroker/gui-components';
import type { Modbus } from '@iobroker/modbus';

import { parseAddress } from './Utils';
import { convertScaleRefs, DEFAULT_OFFSETS, isBitType, rawToInstance, templateToRaw } from './templateAddress';
import {
    collectReads,
    matchTemplates,
    type DetectBlock,
    type DetectMatch,
    type DetectReadResult,
} from './templateDetect';

/**
 * Index of https://github.com/ioBroker/modbus-templates, generated there by `scripts/templates.mjs build`.
 * Keep in sync with FORMAT_VERSION of that script.
 */
const SUPPORTED_FORMAT_VERSION = 1;
const DEFAULT_TEMPLATES_URL = 'https://raw.githubusercontent.com/ioBroker/modbus-templates/main/';
const REPOSITORY_URL = 'https://github.com/ioBroker/modbus-templates';

type AddressingMode = 'raw' | 'alias';
type ImportMode = 'add' | 'replace';

export interface TemplateFile {
    path: string;
    title: string;
    registerType: Modbus.RegisterType;
    registers: number;
    deviceIds?: number[];
    addressing?: AddressingMode;
    /** coils and discrete inputs with alias addresses: "Use direct addresses by aliases" at the time of the export */
    directAddresses?: boolean;
    warnings?: number;
}

export interface TemplateDevice {
    id: string;
    category: string;
    name: string;
    manufacturer?: string;
    models?: string[];
    description?: string;
    readme?: string;
    files: TemplateFile[];
    /** registers that identify the device, see templateDetect.ts */
    detect?: DetectBlock;
}

export interface TemplateIndex {
    formatVersion: number;
    repository: string;
    branch: string;
    categories: { id: string; title: Record<string, string> }[];
    templates: TemplateDevice[];
}

/** Columns of each register type, as the adapter exports them */
const COLUMNS: Record<Modbus.RegisterType, string[]> = {
    disInputs: ['_address', 'name', 'description', 'formula', 'role', 'room', 'cw', 'isScale'],
    coils: ['_address', 'name', 'description', 'formula', 'role', 'room', 'poll', 'wp', 'cw', 'isScale'],
    inputRegs: [
        '_address',
        'name',
        'description',
        'unit',
        'type',
        'len',
        'factor',
        'offset',
        'formula',
        'role',
        'room',
        'cw',
        'isScale',
        'sanitize',
        'sanitizeAction',
        'minValidValue',
        'maxValidValue',
    ],
    holdingRegs: [
        '_address',
        'name',
        'description',
        'unit',
        'type',
        'len',
        'factor',
        'offset',
        'formula',
        'role',
        'room',
        'poll',
        'wp',
        'cw',
        'isScale',
        'sanitize',
        'sanitizeAction',
        'minValidValue',
        'maxValidValue',
    ],
};
const CHECKBOXES = ['poll', 'wp', 'cw', 'isScale', 'sanitize'];

const OFFSET_PARAMS: Record<
    Modbus.RegisterType,
    'coilsOffset' | 'disInputsOffset' | 'inputRegsOffset' | 'holdingRegsOffset'
> = {
    coils: 'coilsOffset',
    disInputs: 'disInputsOffset',
    inputRegs: 'inputRegsOffset',
    holdingRegs: 'holdingRegsOffset',
};
export const REGISTER_TYPE_TITLES: Record<Modbus.RegisterType, string> = {
    disInputs: 'Discrete inputs',
    coils: 'Coils',
    inputRegs: 'Input Registers',
    holdingRegs: 'Holding Registers',
};
const REGISTER_TYPE_ORDER: Modbus.RegisterType[] = ['disInputs', 'coils', 'inputRegs', 'holdingRegs'];

const TYPE_LENGTH: Record<string, number> = {
    uint8be: 1,
    uint8le: 1,
    int8be: 1,
    int8le: 1,
    signExtendedInt8be: 1,
    signExtendedInt8le: 1,
    uint16be: 1,
    uint16le: 1,
    int16be: 1,
    int16le: 1,
    uint32be: 2,
    uint32le: 2,
    uint32sw: 2,
    uint32sb: 2,
    int32be: 2,
    int32le: 2,
    int32sw: 2,
    int32sb: 2,
    floatbe: 2,
    floatle: 2,
    floatsw: 2,
    floatsb: 2,
    uint64be: 4,
    uint64le: 4,
    int64be: 4,
    int64le: 4,
    uint64bestr: 4,
    uint64lestr: 4,
    int64bestr: 4,
    int64lestr: 4,
    doublebe: 4,
    doublele: 4,
};

function getBaseUrl(): string {
    // can be overwritten for testing a fork or a local copy:
    // localStorage.setItem('Modbus.templatesUrl', 'http://localhost:8080/')
    let url = window.localStorage.getItem('Modbus.templatesUrl') || DEFAULT_TEMPLATES_URL;
    if (!url.endsWith('/')) {
        url += '/';
    }
    return url;
}

function fileUrl(path: string): string {
    return getBaseUrl() + path.split('/').map(encodeURIComponent).join('/');
}

function githubUrl(index: TemplateIndex | null, path: string): string {
    const repo = index?.repository ? `https://github.com/${index.repository}` : REPOSITORY_URL;
    return `${repo}/blob/${index?.branch || 'main'}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

// cache for the session, so that the dialog opens immediately the second time
let indexCache: TemplateIndex | null = null;
const fileCache: Record<string, string> = {};

async function fetchText(path: string): Promise<string> {
    if (fileCache[path] !== undefined) {
        return fileCache[path];
    }
    const response = await fetch(fileUrl(path), { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} (${path})`);
    }
    const text = await response.text();
    fileCache[path] = text;
    return text;
}

interface ParsedTemplateFile {
    registers: Modbus.Register[];
    /** rows that could not be converted to the address format of the instance */
    skipped: number;
}

/**
 * Converts a TSV file of the template library into registers of this instance.
 * Columns are taken by name, so older exports (fewer columns, other order) work too.
 */
export function convertTemplateFile(
    text: string,
    file: TemplateFile,
    options: {
        addressing: AddressingMode;
        /** bit order of the template (coils and discrete inputs with alias addresses) */
        directAddresses: boolean;
        params: Modbus.ModbusAdapterConfig['params'];
        multiDeviceId: boolean;
        slaveId: number;
    },
): ParsedTemplateFile {
    const regType = file.registerType;
    if (text.charCodeAt(0) === 0xfeff) {
        text = text.slice(1);
    }
    const rows = tsv2json(text.endsWith('\n') ? text : `${text}\n`);
    const isEmpty = (row: string[]): boolean => !row || row.every(cell => !cell || !cell.trim());
    while (rows.length && isEmpty(rows[0])) {
        rows.shift();
    }
    const header = (rows.shift() || []).map(h => (h || '').trim());
    const col = (name: string): number => header.indexOf(name);

    const showAliases = options.params.showAliases === true || (options.params.showAliases as unknown) === 'true';
    const instanceDirect =
        options.params.directAddresses === true || (options.params.directAddresses as unknown) === 'true';
    const instanceOffset =
        parseInt(options.params[OFFSET_PARAMS[regType]] as unknown as string, 10) || DEFAULT_OFFSETS[regType];

    const registers: Modbus.Register[] = [];
    let skipped = 0;

    for (const row of rows) {
        if (isEmpty(row)) {
            continue;
        }
        const get = (name: string): string | undefined => (col(name) === -1 ? undefined : (row[col(name)] ?? ''));
        const item: Record<string, string | number | boolean | undefined> = {};

        for (const name of COLUMNS[regType]) {
            const value = get(name);
            if (CHECKBOXES.includes(name)) {
                // missing "poll" column: poll it, otherwise the register would never be read
                item[name] = value === undefined ? name === 'poll' : value.trim() === 'true';
            } else {
                item[name] = value === undefined ? '' : value;
            }
        }

        // address: template format -> raw (address on the wire) -> format of this instance
        const raw = templateToRaw(
            parseAddress((get('_address') || '').trim()),
            regType,
            options.addressing,
            options.directAddresses,
        );
        if (Number.isNaN(raw)) {
            skipped++;
            continue;
        }
        item._address = rawToInstance(raw, regType, showAliases, instanceDirect, instanceOffset);
        if (isBitType(regType)) {
            // The bit order with aliases is ambiguous, so give the adapter the address on the wire directly
            item.address = raw;
        }
        // for registers "address" is calculated by the adapter from "_address" and the settings

        if (regType === 'inputRegs' || regType === 'holdingRegs') {
            const type = String(item.type || '').trim();
            item.type = type;
            const len = parseInt(String(item.len), 10);
            item.len = TYPE_LENGTH[type] || len || 1;
            if (typeof item.formula === 'string' && item.formula.includes('sf[')) {
                item.formula = convertScaleRefs(item.formula, address => {
                    const rawScale = templateToRaw(address, regType, options.addressing, options.directAddresses);
                    return Number.isNaN(rawScale)
                        ? NaN
                        : rawToInstance(rawScale, regType, showAliases, instanceDirect, instanceOffset);
                });
            }
            if (item.factor === '') {
                item.factor = 1;
            }
            if (item.offset === '') {
                item.offset = 0;
            }
            item.sanitizeAction ||= 'keepLastValid';
            if (item.minValidValue === '') {
                item.minValidValue = undefined;
            }
            if (item.maxValidValue === '') {
                item.maxValidValue = undefined;
            }
        }

        if (options.multiDeviceId) {
            const deviceId = parseInt(get('deviceId') || '', 10);
            item.deviceId = Number.isNaN(deviceId) ? options.slaveId : deviceId;
        }

        item.name = String(item.name).trim();
        registers.push(item as unknown as Modbus.Register);
    }

    return { registers, skipped };
}

/** Merge or replace the registers of one type. Same slave ID, address and name = same register. */
function mergeRegisters(
    existing: Modbus.Register[],
    imported: Modbus.Register[],
    mode: ImportMode,
    multiDeviceId: boolean,
): Modbus.Register[] {
    if (mode === 'replace') {
        return imported;
    }
    const key = (r: Modbus.Register): string =>
        `${multiDeviceId ? parseInt(r.deviceId as string, 10) || 1 : ''}:${parseAddress(r._address)}:${String(r.name || '').toLowerCase()}`;
    const result = existing.map(r => ({ ...r }));
    const positions = new Map(result.map((r, i) => [key(r), i]));
    for (const r of imported) {
        const pos = positions.get(key(r));
        if (pos === undefined) {
            positions.set(key(r), result.length);
            result.push(r);
        } else {
            // keep the room of the user
            result[pos] = { ...r, room: result[pos].room || r.room };
        }
    }
    return result;
}

export interface TemplateImportResult {
    registers: Partial<Record<Modbus.RegisterType, Modbus.Register[]>>;
    params?: Partial<Modbus.ModbusAdapterConfig['params']>;
}

export default function TemplatesDialog(props: {
    native: Modbus.ModbusAdapterConfig;
    onImport: (result: TemplateImportResult) => void;
    onClose: () => void;
    /** for the device detection: the running instance reads the registers */
    socket?: AdminConnection;
    adapterName?: string;
    instance?: number;
    alive?: boolean;
}): React.JSX.Element {
    const params = props.native.params;
    const lang = I18n.getLanguage();
    const instanceMultiDeviceId = params.multiDeviceId === true || (params.multiDeviceId as unknown) === 'true';
    const instanceShowAliases = params.showAliases === true || (params.showAliases as unknown) === 'true';

    const [index, setIndex] = useState<TemplateIndex | null>(indexCache);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [category, setCategory] = useState(window.localStorage.getItem('Modbus.templateCategory') || '');
    const [deviceId, setDeviceId] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [texts, setTexts] = useState<Record<string, string>>({});
    const [mode, setMode] = useState<ImportMode>('add');
    const [addressing, setAddressing] = useState<AddressingMode>(instanceShowAliases ? 'alias' : 'raw');
    const instanceDirect = params.directAddresses === true || (params.directAddresses as unknown) === 'true';
    const [directAddresses, setDirectAddresses] = useState<boolean>(instanceDirect);
    const [slaveId, setSlaveId] = useState(String(parseInt(params.deviceId as unknown as string, 10) || 1));
    const [enableMultiDeviceId, setEnableMultiDeviceId] = useState(true);
    const [detecting, setDetecting] = useState(false);
    const [detectResult, setDetectResult] = useState<{
        matches: DetectMatch[];
        answered: number;
        total: number;
    } | null>(null);
    const [detectError, setDetectError] = useState('');

    const loadIndex = useCallback((force?: boolean): void => {
        if (indexCache && !force) {
            return;
        }
        setLoading(true);
        setError('');
        if (force) {
            Object.keys(fileCache).forEach(key => delete fileCache[key]);
        }
        fetch(fileUrl('templates.json'), { cache: 'no-cache' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`${response.status} ${response.statusText}`);
                }
                return response.json() as Promise<TemplateIndex>;
            })
            .then(json => {
                if (!json || !Array.isArray(json.templates)) {
                    throw new Error('Invalid templates.json');
                }
                if (json.formatVersion > SUPPORTED_FORMAT_VERSION) {
                    throw new Error(
                        I18n.t('The template library is newer than this adapter. Please update the adapter.'),
                    );
                }
                indexCache = json;
                setIndex(json);
            })
            .catch((e: Error) => setError(e.message || String(e)))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => loadIndex(), [loadIndex]);

    const categories = useMemo(() => {
        if (!index) {
            return [];
        }
        return index.categories.map(c => ({ id: c.id, title: c.title[lang] || c.title.en || c.id }));
    }, [index, lang]);

    const devices = useMemo(
        () =>
            (index?.templates || [])
                .filter(t => t.category === category)
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })),
        [index, category],
    );
    const device = devices.find(d => d.id === deviceId) || null;

    // a remembered category, that does not exist anymore
    useEffect(() => {
        if (index && category && !index.categories.find(c => c.id === category)) {
            setCategory('');
        }
    }, [index, category]);

    // preselect all files of the device
    useEffect(() => setSelected(device ? device.files.map(f => f.path) : []), [device]);

    // load the selected files
    useEffect(() => {
        if (!device) {
            return;
        }
        const missing = device.files.filter(f => selected.includes(f.path) && texts[f.path] === undefined);
        if (!missing.length) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        Promise.all(missing.map(f => fetchText(f.path).then(text => [f.path, text] as const)))
            .then(results => {
                if (!cancelled) {
                    setTexts(old => ({ ...old, ...Object.fromEntries(results) }));
                }
            })
            .catch((e: Error) => !cancelled && setError(e.message || String(e)))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [device, selected, texts]);

    const selectedFiles = device ? device.files.filter(f => selected.includes(f.path)) : [];
    const templateDeviceIds = [...new Set(selectedFiles.flatMap(f => f.deviceIds || []))].sort((a, b) => a - b);
    const unknownAddressing = selectedFiles.some(f => !f.addressing);
    // bit order is only asked for coils/discrete inputs with alias addresses, where the template does not say it
    const unknownDirect = selectedFiles.some(
        f => isBitType(f.registerType) && (f.addressing || addressing) === 'alias' && f.directAddresses === undefined,
    );
    const needsMultiDeviceId = !instanceMultiDeviceId && templateDeviceIds.length > 1;
    const multiDeviceId = instanceMultiDeviceId || (needsMultiDeviceId && enableMultiDeviceId);
    const slaveIdNumber = parseInt(slaveId, 10);
    const slaveIdValid = !Number.isNaN(slaveIdNumber) && slaveIdNumber >= 0 && slaveIdNumber <= 255;

    const detectTemplates = (index?.templates || []).filter(t => t.detect?.probes?.length);
    const canDetect = !!props.socket && !!props.adapterName && props.instance !== undefined && !!detectTemplates.length;

    const selectTemplate = (id: string): void => {
        const t = index?.templates.find(item => item.id === id);
        if (t) {
            setCategory(t.category);
            setDeviceId(t.id);
        }
    };

    const detectDevice = async (): Promise<void> => {
        if (!canDetect) {
            return;
        }
        setDetecting(true);
        setDetectError('');
        setDetectResult(null);
        try {
            const reads = collectReads(detectTemplates);
            const answer: { results?: DetectReadResult[]; error?: string } | undefined = await props.socket!.sendTo(
                `${props.adapterName}.${props.instance}`,
                'readRegisters',
                { reads, deviceId: instanceMultiDeviceId && slaveIdValid ? slaveIdNumber : undefined },
            );
            if (!answer || answer.error || !Array.isArray(answer.results)) {
                setDetectError(answer?.error || 'no answer');
                return;
            }
            const matches = matchTemplates(detectTemplates, reads, answer.results);
            setDetectResult({
                matches,
                answered: answer.results.filter(r => r.registers).length,
                total: reads.length,
            });
            // a single clear result is selected directly
            const strong = matches.filter(m => !m.weak);
            if (strong.length === 1 || (!strong.length && matches.length === 1)) {
                selectTemplate((strong[0] || matches[0]).id);
            }
        } catch (e) {
            setDetectError((e as Error).message || String(e));
        } finally {
            setDetecting(false);
        }
    };

    const templateName = (id: string): string => index?.templates.find(t => t.id === id)?.name || id;

    // convert everything that is selected and loaded
    const converted = useMemo(() => {
        const result: Partial<Record<Modbus.RegisterType, Modbus.Register[]>> = {};
        let skipped = 0;
        let complete = true;
        for (const file of selectedFiles) {
            const text = texts[file.path];
            if (text === undefined) {
                complete = false;
                continue;
            }
            const parsed = convertTemplateFile(text, file, {
                addressing: file.addressing || addressing,
                directAddresses: file.directAddresses ?? directAddresses,
                params,
                multiDeviceId,
                slaveId: slaveIdValid ? slaveIdNumber : 1,
            });
            skipped += parsed.skipped;
            result[file.registerType] = [...(result[file.registerType] || []), ...parsed.registers];
        }
        return { registers: result, skipped, complete };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [texts, selected, device, addressing, directAddresses, multiDeviceId, slaveIdNumber, slaveIdValid, params]);

    const importTypes = REGISTER_TYPE_ORDER.filter(t => converted.registers[t]?.length);
    const total = importTypes.reduce((sum, t) => sum + (converted.registers[t]?.length || 0), 0);

    const doImport = (): void => {
        const registers: TemplateImportResult['registers'] = {};
        for (const regType of importTypes) {
            registers[regType] = mergeRegisters(
                props.native[regType] || [],
                converted.registers[regType]!,
                mode,
                multiDeviceId,
            );
        }
        const result: TemplateImportResult = { registers };
        if (needsMultiDeviceId && enableMultiDeviceId) {
            result.params = { multiDeviceId: true };
        }
        window.localStorage.setItem('Modbus.templateCategory', category);
        props.onImport(result);
    };

    const fileLabel = (file: TemplateFile): React.JSX.Element => (
        <span>
            {file.title}
            <Typography
                component="span"
                variant="body2"
                sx={{ color: 'text.secondary', ml: 1 }}
            >
                {I18n.t(REGISTER_TYPE_TITLES[file.registerType])}, {I18n.t('%s registers', file.registers)}
                {file.deviceIds?.length ? `, ${I18n.t('Slave ID')} ${file.deviceIds.join(', ')}` : ''}
            </Typography>
        </span>
    );

    return (
        <Dialog
            open={!0}
            onClose={props.onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>{I18n.t('Template library')}</DialogTitle>
            <DialogContent>
                <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', mb: 2 }}
                >
                    {I18n.t('Templates are loaded from GitHub. Your browser needs internet access.')}{' '}
                    <Link
                        href={REPOSITORY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        ioBroker/modbus-templates
                    </Link>
                </Typography>

                {error ? (
                    <Alert
                        severity="error"
                        className="modbus-fade-in"
                        icon={
                            <IconResult
                                type="error"
                                replay={error}
                            />
                        }
                        sx={{ mb: 2 }}
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                startIcon={<IconRefresh loading={loading} />}
                                disabled={loading}
                                onClick={() => loadIndex(true)}
                            >
                                {I18n.t('Retry')}
                            </Button>
                        }
                    >
                        {I18n.t('Cannot load the template library: %s', error)}
                    </Alert>
                ) : null}

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <FormControl
                        variant="standard"
                        sx={{ minWidth: 220 }}
                        disabled={!index}
                    >
                        <InputLabel id="modbus-template-category">{I18n.t('Category')}</InputLabel>
                        <Select
                            labelId="modbus-template-category"
                            value={categories.find(c => c.id === category) ? category : ''}
                            onChange={e => {
                                setCategory(e.target.value);
                                setDeviceId('');
                            }}
                        >
                            {categories.map(c => (
                                <MenuItem
                                    key={c.id}
                                    value={c.id}
                                >
                                    {c.title} ({index?.templates.filter(t => t.category === c.id).length})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl
                        variant="standard"
                        sx={{ minWidth: 320, flexGrow: 1 }}
                        disabled={!devices.length}
                    >
                        <InputLabel id="modbus-template-device">{I18n.t('Device')}</InputLabel>
                        <Select
                            labelId="modbus-template-device"
                            value={device ? deviceId : ''}
                            onChange={e => setDeviceId(e.target.value)}
                        >
                            {devices.map(d => (
                                <MenuItem
                                    key={d.id}
                                    value={d.id}
                                >
                                    {d.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {device ? (
                        <Button
                            size="small"
                            startIcon={<OpenInNewIcon />}
                            href={githubUrl(index, device.readme || device.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ alignSelf: 'flex-end' }}
                        >
                            {I18n.t(device.readme ? 'Documentation' : 'Show on GitHub')}
                        </Button>
                    ) : null}
                    {canDetect ? (
                        <Tooltip
                            title={I18n.t(
                                props.alive
                                    ? 'Reads a few registers from the device (read only). The instance must be connected.'
                                    : 'The instance must be running',
                            )}
                        >
                            <span style={{ alignSelf: 'flex-end' }}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    className={`modbus-btn modbus-btn-detect${detecting ? ' modbus-detecting' : ''}`}
                                    startIcon={<DetectIcon />}
                                    disabled={!props.alive || detecting}
                                    onClick={() => void detectDevice()}
                                >
                                    {I18n.t('Detect device')}
                                </Button>
                            </span>
                        </Tooltip>
                    ) : null}
                </Box>

                {detecting ? <LinearProgress sx={{ mb: 2 }} /> : null}
                {detectError ? (
                    <Alert
                        severity="error"
                        className="modbus-fade-in"
                        icon={
                            <IconResult
                                type="error"
                                replay={detectError}
                            />
                        }
                        sx={{ mb: 2 }}
                    >
                        {I18n.t('Device detection failed: %s', detectError)}
                    </Alert>
                ) : null}
                {detectResult ? (
                    <Alert
                        severity={detectResult.matches.length ? 'success' : 'info'}
                        className="modbus-fade-in"
                        icon={
                            detectResult.matches.length ? (
                                <IconResult type={detectResult.matches.some(m => !m.weak) ? 'success' : 'warning'} />
                            ) : undefined
                        }
                        sx={{ mb: 2 }}
                        onClose={() => setDetectResult(null)}
                    >
                        {detectResult.matches.length
                            ? detectResult.matches.map(m => (
                                  <div key={m.id}>
                                      {I18n.t(m.weak ? 'Possibly: %s' : 'Detected: %s', templateName(m.id))}
                                      {m.id !== device?.id ? (
                                          <Button
                                              size="small"
                                              sx={{ ml: 1 }}
                                              onClick={() => selectTemplate(m.id)}
                                          >
                                              {I18n.t('Select')}
                                          </Button>
                                      ) : null}
                                  </div>
                              ))
                            : I18n.t(
                                  'No known device detected (%s of %s requests answered). Detection is available for %s devices so far.',
                                  detectResult.answered,
                                  detectResult.total,
                                  detectTemplates.length,
                              )}
                    </Alert>
                ) : null}

                {loading ? <LinearProgress sx={{ mb: 2 }} /> : null}

                {device ? (
                    <div
                        key={device.id}
                        className="modbus-fade-in"
                    >
                        {device.description ? (
                            <Typography
                                variant="body2"
                                sx={{ mb: 1 }}
                            >
                                {device.description}
                            </Typography>
                        ) : null}
                        <FormControl
                            component="fieldset"
                            sx={{ mb: 2, display: 'block' }}
                        >
                            <FormLabel component="legend">{I18n.t('Files')}</FormLabel>
                            {device.files.length > 1 ? (
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            size="small"
                                            checked={selected.length === device.files.length}
                                            indeterminate={!!selected.length && selected.length < device.files.length}
                                            onChange={() =>
                                                setSelected(
                                                    selected.length === device.files.length
                                                        ? []
                                                        : device.files.map(f => f.path),
                                                )
                                            }
                                        />
                                    }
                                    label={<i>{I18n.t('All')}</i>}
                                    sx={{ display: 'flex' }}
                                />
                            ) : null}
                            <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
                                {device.files.map(file => (
                                    <FormControlLabel
                                        key={file.path}
                                        sx={{ display: 'flex' }}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={selected.includes(file.path)}
                                                // a single file is always imported, there is nothing to choose
                                                disabled={device.files.length === 1}
                                                onChange={() =>
                                                    setSelected(
                                                        selected.includes(file.path)
                                                            ? selected.filter(p => p !== file.path)
                                                            : [...selected, file.path],
                                                    )
                                                }
                                            />
                                        }
                                        label={fileLabel(file)}
                                    />
                                ))}
                            </Box>
                        </FormControl>

                        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', mb: 1 }}>
                            <FormControl component="fieldset">
                                <FormLabel component="legend">{I18n.t('Import mode')}</FormLabel>
                                <RadioGroup
                                    value={mode}
                                    onChange={e => setMode(e.target.value as ImportMode)}
                                >
                                    <FormControlLabel
                                        value="add"
                                        control={<Radio size="small" />}
                                        label={I18n.t('Add to existing registers')}
                                    />
                                    <FormControlLabel
                                        value="replace"
                                        control={<Radio size="small" />}
                                        label={I18n.t('Replace existing registers')}
                                    />
                                </RadioGroup>
                            </FormControl>
                            {unknownAddressing ? (
                                <FormControl component="fieldset">
                                    <FormLabel component="legend">{I18n.t('Addresses in the template')}</FormLabel>
                                    <RadioGroup
                                        value={addressing}
                                        onChange={e => setAddressing(e.target.value as AddressingMode)}
                                    >
                                        <FormControlLabel
                                            value="raw"
                                            control={<Radio size="small" />}
                                            label={I18n.t('Raw addresses (as in the data sheet)')}
                                        />
                                        <FormControlLabel
                                            value="alias"
                                            control={<Radio size="small" />}
                                            label={I18n.t('With alias offset (30001, 40001, ...)')}
                                        />
                                    </RadioGroup>
                                </FormControl>
                            ) : null}
                            {unknownDirect ? (
                                <FormControl component="fieldset">
                                    <FormLabel component="legend">
                                        {I18n.t('Bit order in the template (coils, discrete inputs)')}
                                    </FormLabel>
                                    <RadioGroup
                                        value={directAddresses ? 'direct' : 'reversed'}
                                        onChange={e => setDirectAddresses(e.target.value === 'direct')}
                                    >
                                        <FormControlLabel
                                            value="reversed"
                                            control={<Radio size="small" />}
                                            label={I18n.t('Not direct (alias 10001 = bit 15)')}
                                        />
                                        <FormControlLabel
                                            value="direct"
                                            control={<Radio size="small" />}
                                            label={I18n.t('Direct addresses (alias 10001 = bit 0)')}
                                        />
                                    </RadioGroup>
                                </FormControl>
                            ) : null}
                            {instanceMultiDeviceId && selectedFiles.some(f => !f.deviceIds?.length) ? (
                                <TextField
                                    variant="standard"
                                    label={I18n.t('Slave ID')}
                                    value={slaveId}
                                    error={!slaveIdValid}
                                    onChange={e => setSlaveId(e.target.value)}
                                    helperText={I18n.t('For registers without Slave ID in the template')}
                                    sx={{ width: 220 }}
                                />
                            ) : null}
                        </Box>

                        {needsMultiDeviceId ? (
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={enableMultiDeviceId}
                                        onChange={() => setEnableMultiDeviceId(!enableMultiDeviceId)}
                                    />
                                }
                                label={I18n.t(
                                    'The template uses the Slave IDs %s. Enable multiple Slave IDs for this instance.',
                                    templateDeviceIds.join(', '),
                                )}
                            />
                        ) : null}
                        {!instanceMultiDeviceId && templateDeviceIds.length === 1 ? (
                            <Alert
                                severity="info"
                                sx={{ mb: 1 }}
                            >
                                {I18n.t(
                                    'The template is made for Slave ID %s. The Slave ID is set in the connection settings.',
                                    templateDeviceIds[0],
                                )}
                            </Alert>
                        ) : null}
                        {converted.skipped ? (
                            <Alert
                                severity="warning"
                                icon={
                                    <IconResult
                                        type="warning"
                                        replay={converted.skipped}
                                    />
                                }
                                sx={{ mb: 1 }}
                            >
                                {I18n.t(
                                    '%s registers are skipped, because their address does not fit to the selected address format.',
                                    converted.skipped,
                                )}
                            </Alert>
                        ) : null}
                        {converted.complete && importTypes.length ? (
                            <Alert
                                severity={mode === 'replace' ? 'warning' : 'success'}
                                icon={
                                    <IconResult
                                        type={mode === 'replace' ? 'warning' : 'success'}
                                        replay={`${mode}:${total}`}
                                    />
                                }
                            >
                                {importTypes.map(t => (
                                    <div key={t}>
                                        <b>{I18n.t(REGISTER_TYPE_TITLES[t])}</b>:{' '}
                                        {I18n.t('%s registers', converted.registers[t]!.length)}
                                        {mode === 'replace' && props.native[t]?.length
                                            ? `, ${I18n.t('%s existing registers will be removed', props.native[t].length)}`
                                            : ''}
                                    </div>
                                ))}
                            </Alert>
                        ) : null}
                    </div>
                ) : null}

                <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', mt: 2 }}
                >
                    {I18n.t('Your device is missing?')}{' '}
                    <Link
                        href={REPOSITORY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {I18n.t('Share your registers as template')}
                    </Link>
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    color="primary"
                    disabled={!converted.complete || !total || loading || (!slaveIdValid && multiDeviceId)}
                    onClick={doImport}
                    startIcon={<CheckIcon />}
                >
                    {I18n.t('Import')}
                    {total ? (
                        <span
                            key={total}
                            className="modbus-count"
                            style={{ marginLeft: 4 }}
                        >
                            ({total})
                        </span>
                    ) : null}
                </Button>
                <Button
                    variant="contained"
                    color="grey"
                    onClick={props.onClose}
                    startIcon={<ClearIcon />}
                >
                    {I18n.t('Close')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
