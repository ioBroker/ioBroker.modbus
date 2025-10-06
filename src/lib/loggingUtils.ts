/**
 * Utility functions for logging management
 */

/**
 * Create a logging wrapper that can filter connection error messages
 *
 * @param originalLog - The original logger object
 * @param disableLogging - Whether to disable connection error logging
 * @returns The wrapped logger or original logger
 */
export function createLoggingWrapper(originalLog: ioBroker.Logger, disableLogging?: boolean): ioBroker.Logger {
    if (!disableLogging) {
        return originalLog;
    }

    // List of connection error messages that should be suppressed when logging is disabled
    const suppressedErrorMessages = ['Socket Error', 'Client in error state'];

    return {
        silly: originalLog.silly.bind(originalLog),
        level: originalLog.level,
        debug: originalLog.debug.bind(originalLog),
        info: originalLog.info.bind(originalLog),
        warn: originalLog.warn.bind(originalLog),
        error: (msg: string | Error, ...args: any[]): void => {
            // Check if this is a connection error message that should be suppressed
            if (typeof msg === 'string' && suppressedErrorMessages.some(pattern => msg.includes(pattern))) {
                // Suppress this error message when logging is disabled
                return;
            }
            // Allow all other error messages through
            originalLog.error(msg.toString() + (args.length > 0 ? ` ${args.join(', ')}` : ''));
        },
    };
}
