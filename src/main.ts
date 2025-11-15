import ModbusTemplate, { type Modbus } from '@iobroker/modbus';
import type { AdapterOptions } from '@iobroker/adapter-core';

// Extended Register type with sanitization options
export interface ExtendedRegister extends Modbus.Register {
    sanitizeInvalid?: boolean;
    sanitizeMode?: 'keepLast' | 'setZero';
    minValue?: number | string;
    maxValue?: number | string;
}

export class ModbusAdapter extends ModbusTemplate {
    declare config: Modbus.ModbusAdapterConfig;
    private lastValidValues: Record<string, number> = {};
    private registerConfig: Map<string, ExtendedRegister> = new Map();

    public constructor(options: Partial<AdapterOptions> = {}) {
        super('modbus', options, {
            onBeforeReady: async (): Promise<void> => {
                // Backwards compatibility
                if (
                    (!this.config.params.host && this.config.params.bind) ||
                    // @ts-expect-error backwards compatibility
                    (this.config.params.pulseTime === undefined && this.config.params.pulsetime !== undefined)
                ) {
                    const obj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
                    if (obj) {
                        // @ts-expect-error backwards compatibility
                        obj.native.params.pulseTime ||= this.config.params.pulsetime;
                        delete obj.native.params.pulsetime;
                        obj.native.params.host ||= this.config.params.bind;
                        await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, obj);
                    }
                }

                // Build register configuration map for sanitization
                this.buildRegisterConfigMap();
            },
        });
    }

    /**
     * Build a map of register configurations for quick lookup during sanitization
     *
     * but exported for testing
     */
    buildRegisterConfigMap(): void {
        const registerTypes: Array<'disInputs' | 'coils' | 'inputRegs' | 'holdingRegs'> = [
            'disInputs',
            'coils',
            'inputRegs',
            'holdingRegs',
        ];

        for (const regType of registerTypes) {
            const registers = this.config[regType] as ExtendedRegister[] | undefined;
            if (registers && Array.isArray(registers)) {
                for (const register of registers) {
                    if (register.name) {
                        // Store by the state ID pattern that will be used
                        const key = register.name;
                        this.registerConfig.set(key, register);
                    }
                }
            }
        }
    }

    /**
     * Check if a value is invalid (NaN, Infinity, extreme floats, null, undefined)
     *
     * but exported for testing
     */
    isInvalidValue(value: unknown): boolean {
        if (value === null || value === undefined) {
            return true;
        }
        if (typeof value !== 'number') {
            return false; // Non-numeric values are handled differently
        }
        if (!isFinite(value)) {
            return true; // NaN or Infinity
        }
        // Check for extreme IEEE 754 float values (typical Modbus errors)
        // Single precision float min/max: ±3.4028235e+38
        if (value <= -3.4e38 || value >= 3.4e38) {
            return true;
        }
        return false;
    }

    /**
     * Check if a value is outside the configured min/max range
     *
     * but exported for testing
     */
    isOutOfRange(value: number, register: ExtendedRegister): boolean {
        if (register.minValue !== undefined && register.minValue !== '') {
            const minVal = typeof register.minValue === 'string' ? parseFloat(register.minValue) : register.minValue;
            if (!isNaN(minVal) && value < minVal) {
                return true;
            }
        }
        if (register.maxValue !== undefined && register.maxValue !== '') {
            const maxVal = typeof register.maxValue === 'string' ? parseFloat(register.maxValue) : register.maxValue;
            if (!isNaN(maxVal) && value > maxVal) {
                return true;
            }
        }
        return false;
    }

    /**
     * Sanitize a value based on register configuration
     *
     * but exported for testing
     */
    sanitizeValue(id: string, value: unknown, register?: ExtendedRegister): unknown {
        // If no register config or sanitization not enabled, pass through
        if (!register || !register.sanitizeInvalid) {
            return value;
        }

        // Only sanitize numeric values
        if (typeof value !== 'number') {
            return value;
        }

        // Check if value is invalid
        const invalid = this.isInvalidValue(value) || this.isOutOfRange(value, register);

        if (invalid) {
            const mode = register.sanitizeMode || 'keepLast';
            let sanitizedValue: number;

            if (mode === 'setZero') {
                sanitizedValue = 0;
            } else {
                // keepLast mode
                sanitizedValue = this.lastValidValues[id] ?? 0;
            }

            this.log.debug(`Sanitized invalid value for ${id}: ${value} -> ${sanitizedValue} (mode: ${mode})`);
            return sanitizedValue;
        }

        // Value is valid, store it for future use
        this.lastValidValues[id] = value;
        return value;
    }

    /**
     * Find register config by state ID
     *
     * but exported for testing
     */
    findRegisterConfig(id: string): ExtendedRegister | undefined {
        // Try exact match first
        if (this.registerConfig.has(id)) {
            return this.registerConfig.get(id);
        }

        // Extract the register name from the full state ID
        // Format is typically: modbus.X.holdingRegisters.40001_registerName
        const parts = id.split('.');
        if (parts.length >= 3) {
            // Get the last part which may include address prefix
            const lastPart = parts[parts.length - 1];

            // Check if it contains underscore (address_name format)
            if (lastPart.includes('_')) {
                const registerName = lastPart.substring(lastPart.indexOf('_') + 1);
                if (this.registerConfig.has(registerName)) {
                    return this.registerConfig.get(registerName);
                }
            }

            // Try matching by the last part directly (register name)
            if (this.registerConfig.has(lastPart)) {
                return this.registerConfig.get(lastPart);
            }

            // Try matching by multiple parts combined
            for (let i = 2; i < parts.length; i++) {
                const partialId = parts.slice(i).join('.');
                if (this.registerConfig.has(partialId)) {
                    return this.registerConfig.get(partialId);
                }
            }
        }

        return undefined;
    }

    /**
     * Override setState to add value sanitization
     */
    setState<T extends ioBroker.SetStateCallback | undefined>(
        id: string | ioBroker.IdObject,
        state: ioBroker.State | ioBroker.SettableState | ioBroker.StateValue,
        callback?: T,
    ): T extends unknown ? ioBroker.SetStatePromise : void;
    setState<T extends ioBroker.SetStateCallback | undefined>(
        id: string | ioBroker.IdObject,
        state: ioBroker.State | ioBroker.SettableState | ioBroker.StateValue,
        ack: boolean,
        callback?: T,
    ): T extends unknown ? ioBroker.SetStatePromise : void;
    setState<T extends ioBroker.SetStateCallback | undefined>(
        id: string | ioBroker.IdObject,
        state: ioBroker.State | ioBroker.SettableState | ioBroker.StateValue,
        ackOrCallback?: boolean | T,
        callback?: T,
    ): T extends unknown ? ioBroker.SetStatePromise : void {
        // Convert id to string for lookups
        let stringId: string;
        if (typeof id === 'string') {
            stringId = id;
        } else if (typeof id === 'object' && id !== null && 'id' in id) {
            // IdObject has an id property
            stringId = (id as { id: string }).id;
        } else {
            // Fallback - this should rarely happen
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            stringId = String(id);
        }

        // Skip sanitization for info states (connection status, poll time, etc.)
        if (stringId.includes('.info.')) {
            return super.setState(id, state, ackOrCallback as boolean, callback) as T extends unknown
                ? ioBroker.SetStatePromise
                : void;
        }

        // Find register configuration
        const register = this.findRegisterConfig(stringId);

        // Extract value from state object or use direct value
        let value: unknown;
        if (
            typeof state === 'object' &&
            state !== null &&
            'val' in state &&
            !(state instanceof Date) &&
            !Buffer.isBuffer(state)
        ) {
            value = (state as ioBroker.State).val;
        } else {
            value = state;
        }

        // Sanitize the value
        const sanitizedValue = this.sanitizeValue(stringId, value, register);

        // Reconstruct state with sanitized value
        let sanitizedState: typeof state;
        if (
            typeof state === 'object' &&
            state !== null &&
            'val' in state &&
            !(state instanceof Date) &&
            !Buffer.isBuffer(state)
        ) {
            sanitizedState = { ...state, val: sanitizedValue } as ioBroker.State;
        } else {
            sanitizedState = sanitizedValue as ioBroker.StateValue;
        }

        // Call parent setState with sanitized value
        return super.setState(id, sanitizedState, ackOrCallback as boolean, callback) as T extends unknown
            ? ioBroker.SetStatePromise
            : void;
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
