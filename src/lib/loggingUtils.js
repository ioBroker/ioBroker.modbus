/**
 * Utility functions for logging management
 */

/**
 * Create a logging wrapper that can filter connection error messages
 *
 * @param {object} originalLog - The original logger object
 * @param {boolean} disableLogging - Whether to disable connection error logging
 * @returns {object} The wrapped logger or original logger
 */
function createLoggingWrapper(originalLog, disableLogging) {
    if (!disableLogging) {
        return originalLog;
    }

    // List of connection error messages that should be suppressed when logging is disabled
    const suppressedErrorMessages = ['Socket Error', 'Client in error state'];

    return {
        debug: originalLog.debug.bind(originalLog),
        info: originalLog.info.bind(originalLog),
        warn: originalLog.warn.bind(originalLog),
        error: (msg, ...args) => {
            // Check if this is a connection error message that should be suppressed
            if (typeof msg === 'string' && suppressedErrorMessages.some(pattern => msg.includes(pattern))) {
                // Suppress this error message when logging is disabled
                return;
            }
            // Allow all other error messages through
            originalLog.error(msg, ...args);
        },
        log: originalLog.log ? originalLog.log.bind(originalLog) : originalLog.debug.bind(originalLog),
    };
}

module.exports = {
    createLoggingWrapper,
};
