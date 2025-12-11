const expect = require('chai').expect;

describe('Unit tests for value sanitization logic', function () {
    // Test the logic without requiring full adapter initialization
    
    describe('Invalid value detection', function () {
        function isInvalidValue(value) {
            if (value === null || value === undefined) {
                return true;
            }
            if (typeof value !== 'number') {
                return false;
            }
            if (!isFinite(value)) {
                return true;
            }
            if (value <= -3.4e38 || value >= 3.4e38) {
                return true;
            }
            return false;
        }

        it('should detect null as invalid', function () {
            expect(isInvalidValue(null)).to.be.true;
        });

        it('should detect undefined as invalid', function () {
            expect(isInvalidValue(undefined)).to.be.true;
        });

        it('should detect NaN as invalid', function () {
            expect(isInvalidValue(NaN)).to.be.true;
        });

        it('should detect Infinity as invalid', function () {
            expect(isInvalidValue(Infinity)).to.be.true;
        });

        it('should detect -Infinity as invalid', function () {
            expect(isInvalidValue(-Infinity)).to.be.true;
        });

        it('should detect extreme positive float as invalid', function () {
            expect(isInvalidValue(3.5e38)).to.be.true;
        });

        it('should detect extreme negative float as invalid', function () {
            expect(isInvalidValue(-3.5e38)).to.be.true;
        });

        it('should not detect normal numbers as invalid', function () {
            expect(isInvalidValue(42.5)).to.be.false;
            expect(isInvalidValue(0)).to.be.false;
            expect(isInvalidValue(-100)).to.be.false;
            expect(isInvalidValue(1000.123)).to.be.false;
        });

        it('should not detect non-numeric values as invalid', function () {
            expect(isInvalidValue('string')).to.be.false;
            expect(isInvalidValue(true)).to.be.false;
            expect(isInvalidValue(false)).to.be.false;
        });
    });

    describe('Range validation', function () {
        function isOutOfRange(value, minValue, maxValue) {
            if (minValue !== undefined && minValue !== '') {
                const minVal = typeof minValue === 'string' ? parseFloat(minValue) : minValue;
                if (!isNaN(minVal) && value < minVal) {
                    return true;
                }
            }
            if (maxValue !== undefined && maxValue !== '') {
                const maxVal = typeof maxValue === 'string' ? parseFloat(maxValue) : maxValue;
                if (!isNaN(maxVal) && value > maxVal) {
                    return true;
                }
            }
            return false;
        }

        it('should detect value below minimum', function () {
            expect(isOutOfRange(-150, -100, 100)).to.be.true;
        });

        it('should detect value above maximum', function () {
            expect(isOutOfRange(200, -100, 100)).to.be.true;
        });

        it('should not detect value within range', function () {
            expect(isOutOfRange(0, -100, 100)).to.be.false;
            expect(isOutOfRange(-100, -100, 100)).to.be.false;
            expect(isOutOfRange(100, -100, 100)).to.be.false;
            expect(isOutOfRange(50, -100, 100)).to.be.false;
        });

        it('should not detect out of range when no limits set', function () {
            expect(isOutOfRange(1000000, undefined, undefined)).to.be.false;
            expect(isOutOfRange(-1000000, undefined, undefined)).to.be.false;
        });

        it('should handle string min/max values', function () {
            expect(isOutOfRange(-150, '-100', '100')).to.be.true;
            expect(isOutOfRange(200, '-100', '100')).to.be.true;
            expect(isOutOfRange(50, '-100', '100')).to.be.false;
        });
    });

    describe('Sanitization modes', function () {
        const lastValidValues = {};

        function sanitizeValue(id, value, config) {
            if (!config || !config.sanitizeInvalid) {
                return value;
            }

            if (typeof value !== 'number') {
                return value;
            }

            // Check if invalid
            const isInvalid = (value === null || value === undefined) ||
                             !isFinite(value) ||
                             (value <= -3.4e38 || value >= 3.4e38);

            // Check range
            const outOfRange = config.minValue !== undefined && value < config.minValue ||
                              config.maxValue !== undefined && value > config.maxValue;

            if (isInvalid || outOfRange) {
                const mode = config.sanitizeMode || 'keepLast';
                if (mode === 'setZero') {
                    return 0;
                } else {
                    return lastValidValues[id] ?? 0;
                }
            }

            lastValidValues[id] = value;
            return value;
        }

        beforeEach(function () {
            // Clear lastValidValues before each test
            for (const key in lastValidValues) {
                delete lastValidValues[key];
            }
        });

        it('keepLast mode - should return original value when valid', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'keepLast' };
            const result = sanitizeValue('test1', 42.5, config);
            expect(result).to.equal(42.5);
        });

        it('keepLast mode - should return last valid value on NaN', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'keepLast' };
            sanitizeValue('test2', 100, config);
            const result = sanitizeValue('test2', NaN, config);
            expect(result).to.equal(100);
        });

        it('keepLast mode - should return 0 when no last valid value exists', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'keepLast' };
            const result = sanitizeValue('test3', Infinity, config);
            expect(result).to.equal(0);
        });

        it('setZero mode - should return 0 on invalid value', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'setZero' };
            expect(sanitizeValue('test4', NaN, config)).to.equal(0);
            expect(sanitizeValue('test4', Infinity, config)).to.equal(0);
        });

        it('setZero mode - should return original value when valid', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'setZero' };
            const result = sanitizeValue('test5', 75.5, config);
            expect(result).to.equal(75.5);
        });

        it('min/max - should sanitize value below minimum', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'keepLast', minValue: -100, maxValue: 100 };
            sanitizeValue('test6', 50, config);
            const result = sanitizeValue('test6', -200, config);
            expect(result).to.equal(50);
        });

        it('min/max - should sanitize value above maximum', function () {
            const config = { sanitizeInvalid: true, sanitizeMode: 'keepLast', minValue: -100, maxValue: 100 };
            sanitizeValue('test7', 25, config);
            const result = sanitizeValue('test7', 300, config);
            expect(result).to.equal(25);
        });

        it('disabled - should pass through invalid values when sanitization disabled', function () {
            const config = { sanitizeInvalid: false };
            const nanResult = sanitizeValue('test8', NaN, config);
            expect(isNaN(nanResult)).to.be.true;
        });
    });
});
