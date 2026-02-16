import ModbusTemplate, { type Modbus } from '@iobroker/modbus';
import type { AdapterOptions } from '@iobroker/adapter-core';

/** Extended register type with sanitization options */
interface ExtendedRegister extends Modbus.Register {
    sanitize?: boolean;
    sanitizeAction?: 'keepLastValid' | 'replaceWithZero';
    minValidValue?: number | string;
    maxValidValue?: number | string;
}

export class ModbusAdapter extends ModbusTemplate {
    declare config: Modbus.ModbusAdapterConfig & {
        params: Modbus.ModbusParameters & {
            enableSanitization?: boolean;
        };
        disInputs?: ExtendedRegister[];
        coils?: ExtendedRegister[];
        inputRegs?: ExtendedRegister[];
        holdingRegs?: ExtendedRegister[];
    };
    private lastValidValues: Map<string, number> = new Map();
    private registerSanitizationConfig: Map<string, ExtendedRegister> = new Map();

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

                // Initialize sanitization configuration
                this.initializeSanitizationConfig();

                // Wrap setState if sanitization is enabled
                if (this.config.params.enableSanitization) {
                    this.wrapSetState();
                }
            },
        });
    }

    /**
     * Wrap setState method to add sanitization
     */
    private wrapSetState(): void {
        // Store original setState
        const originalSetState = this.setState.bind(this);

        // Replace setState with wrapped version
        this.setState = ((...args: Parameters<typeof originalSetState>): ReturnType<typeof originalSetState> => {
            const [id, state] = args;

            // Check if this state should be sanitized
            if (typeof id === 'string') {
                // Extract the register name from the full state ID
                const parts = id.split('.');
                const registerName = parts[parts.length - 1];

                // Check if we have sanitization config for this register
                const config = this.registerSanitizationConfig.get(registerName);
                if (config) {
                    // Extract value from state object or use state directly
                    const value = typeof state === 'object' && state !== null && 'val' in state ? state.val : state;

                    // Apply sanitization
                    const sanitizedValue = this.sanitizeValue(registerName, value, config);

                    // Update state with sanitized value
                    if (typeof state === 'object' && state !== null && 'val' in state) {
                        args[1] = { ...state, val: sanitizedValue };
                    } else {
                        args[1] = sanitizedValue;
                    }
                }
            }

            // Call original setState with potentially modified arguments
            return originalSetState(...args);
        }) as typeof originalSetState;
    }

    /**
     * Initialize sanitization configuration from registers
     */
    private initializeSanitizationConfig(): void {
        // Check if sanitization is enabled globally
        if (!this.config.params.enableSanitization) {
            return;
        }

        // Process all register types
        const registerTypes = ['disInputs', 'coils', 'inputRegs', 'holdingRegs'] as const;

        for (const regType of registerTypes) {
            const registers = this.config[regType] as ExtendedRegister[] | undefined;
            if (registers) {
                for (const register of registers) {
                    if (register.sanitize) {
                        // Build the state ID for this register
                        const stateId = this.buildStateId(register);
                        this.registerSanitizationConfig.set(stateId, register);
                        this.log.debug(
                            `Sanitization enabled for ${stateId}: action=${register.sanitizeAction || 'keepLastValid'}`,
                        );
                    }
                }
            }
        }
    }

    /**
     * Build state ID from register configuration
     */
    private buildStateId(register: ExtendedRegister): string {
        // The state ID is built by the base adapter using the register name
        // We'll use the name from the register directly as it appears in the config
        return register.name;
    }

    /**
     * Check if a value is invalid (NaN, Infinity, or extreme float values)
     */
    private isInvalidValue(value: unknown): boolean {
        if (typeof value !== 'number') {
            return value === null || value === undefined;
        }

        // Check for NaN
        if (isNaN(value)) {
            return true;
        }

        // Check for Infinity
        if (!isFinite(value)) {
            return true;
        }

        // Check for extreme float values (typical Modbus error values)
        // IEEE 754 minimum float: -3.402823466e+38
        // IEEE 754 maximum float: 3.402823466e+38
        const MAX_FLOAT32 = 3.4e38;
        if (value <= -MAX_FLOAT32 || value >= MAX_FLOAT32) {
            return true;
        }

        return false;
    }

    /**
     * Check if value is within valid range
     */
    private isWithinRange(value: number, min?: number | string, max?: number | string): boolean {
        const minVal = typeof min === 'string' ? parseFloat(min) : min;
        const maxVal = typeof max === 'string' ? parseFloat(max) : max;

        if (minVal !== undefined && !isNaN(minVal) && value < minVal) {
            return false;
        }

        if (maxVal !== undefined && !isNaN(maxVal) && value > maxVal) {
            return false;
        }

        return true;
    }

    /**
     * Sanitize a value according to register configuration
     */
    private sanitizeValue(id: string, value: unknown, config: ExtendedRegister): number | ioBroker.StateValue {
        // Check if value is invalid
        if (this.isInvalidValue(value)) {
            this.log.warn(`Invalid value detected for ${id}: ${String(value)} - applying sanitization`);
            return this.applySanitization(id, value, config);
        }

        // For numeric values, check range
        if (typeof value === 'number') {
            if (!this.isWithinRange(value, config.minValidValue, config.maxValidValue)) {
                const min = config.minValidValue !== undefined ? config.minValidValue : '-∞';
                const max = config.maxValidValue !== undefined ? config.maxValidValue : '∞';
                this.log.warn(
                    `Value ${value} for ${id} is outside valid range [${min}, ${max}] - applying sanitization`,
                );
                return this.applySanitization(id, value, config);
            }
        }

        // Value is valid - store it as last valid value
        if (typeof value === 'number') {
            this.lastValidValues.set(id, value);
        }

        return value as ioBroker.StateValue;
    }

    /**
     * Apply sanitization action
     */
    private applySanitization(id: string, invalidValue: unknown, config: ExtendedRegister): number {
        const action = config.sanitizeAction || 'keepLastValid';

        if (action === 'replaceWithZero') {
            this.log.debug(`Replacing invalid value for ${id} with 0`);
            return 0;
        }

        // Default: keepLastValid
        const lastValid = this.lastValidValues.get(id);
        if (lastValid !== undefined) {
            this.log.debug(`Keeping last valid value for ${id}: ${lastValid}`);
            return lastValid;
        }

        // No last valid value available, use 0 as fallback
        this.log.debug(`No last valid value for ${id}, using 0 as fallback`);
        return 0;
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
