/* eslint-disable no-console */
const assert = require('node:assert');

// Import the splitByAddress logic from main.js
function iterateAddresses(isBools, deviceId, result, regName, regType, localOptions) {
    const config = result.config;

    if (config && config.length) {
        result.addressLow = 0xffffffff;
        result.addressHigh = 0;
        result.length = 0;
        result.blocks = [];

        // Sort configs by address
        config.sort((a, b) => parseInt(a.address, 10) - parseInt(b.address, 10));

        for (let i = config.length - 1; i >= 0; i--) {
            if (config[i].deviceId !== deviceId) {
                config.splice(i, 1);
                continue;
            }
            const address = (config[i].address = parseInt(config[i].address, 10));

            if (address < 0) {
                config.splice(i, 1);
                continue;
            }

            if (!isBools) {
                config[i].type = config[i].type || 'uint16be';
                config[i].len = config[i].len || 1;
            } else {
                config[i].len = 1;
            }

            if (address < result.addressLow) {
                result.addressLow = address;
            }
            if (address + (config[i].len || 1) > result.addressHigh) {
                result.addressHigh = address + (config[i].len || 1);
            }
        }

        const maxBlock = isBools ? localOptions.maxBoolBlock : localOptions.maxBlock;
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
            if (result.blocks) {
                const wouldExceedLimit = config[i].address + config[i].len - blockStart > maxBlock;
                const hasAddressGap = config[i].address - lastAddress > 10 && config[i].len < 10;

                if (hasAddressGap || wouldExceedLimit) {
                    if (!result.blocks.map(obj => obj.start).includes(blockStart)) {
                        result.blocks.push({
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
            result.blocks &&
            !result.blocks.map(obj => obj.start).includes(blockStart)
        ) {
            result.blocks.push({
                start: blockStart,
                count: lastAddress - blockStart,
                startIndex: startIndex,
                endIndex: i,
            });
        }

        if (config.length) {
            result.length = result.addressHigh - result.addressLow;
        }
    }
}

describe('Max Read Request Length', function () {
    it('should respect maxBlock for float registers', function () {
        const result = {
            config: [
                { deviceId: 1, address: 4000, len: 7, type: 'floatbe' },
                { deviceId: 1, address: 4007, len: 10, type: 'floatbe' }, // 17 total, under limit
                { deviceId: 1, address: 4017, len: 5, type: 'floatbe' }, // would make 22 total, exceeds 20
                { deviceId: 1, address: 4022, len: 15, type: 'floatbe' }, // under limit individually
            ],
        };

        const localOptions = {
            maxBlock: 20,
            maxBoolBlock: 128,
        };

        iterateAddresses(false, 1, result, 'holdingRegisters', 'holdingRegs', localOptions);

        // All blocks should respect the maxBlock limit of 20
        result.blocks.forEach((block, index) => {
            assert.ok(
                block.count <= localOptions.maxBlock,
                `Block ${index} count ${block.count} exceeds maxBlock limit of ${localOptions.maxBlock}`,
            );
        });

        // We should have more than one block due to splitting
        assert.ok(result.blocks.length > 1);
    });

    it('should respect maxBoolBlock for boolean registers', function () {
        const boolConfig = [];
        // Create 50 consecutive boolean registers
        for (let i = 0; i < 50; i++) {
            boolConfig.push({ deviceId: 1, address: 7040 + i, len: 1 });
        }

        const result = { config: boolConfig };
        const localOptions = {
            maxBlock: 100,
            maxBoolBlock: 30,
        };

        iterateAddresses(true, 1, result, 'coils', 'coils', localOptions);

        // All blocks should respect the maxBoolBlock limit of 30
        result.blocks.forEach((block, index) => {
            assert.ok(
                block.count <= localOptions.maxBoolBlock,
                `Block ${index} count ${block.count} exceeds maxBoolBlock limit of ${localOptions.maxBoolBlock}`,
            );
        });

        // We should have multiple blocks due to splitting
        assert.ok(result.blocks.length > 1);
    });

    it('should handle the original issue scenario correctly', function () {
        // Simulate a scenario similar to the original issue
        // where many small registers could be grouped into large blocks
        const result = {
            config: [],
        };

        // Create many single-word registers that could be grouped
        for (let addr = 4000; addr <= 4030; addr++) {
            result.config.push({ deviceId: 1, address: addr, len: 1, type: 'uint16be' });
        }

        const localOptions = {
            maxBlock: 20,
            maxBoolBlock: 128,
        };

        iterateAddresses(false, 1, result, 'holdingRegisters', 'holdingRegs', localOptions);

        // All blocks should respect the maxBlock limit of 20
        result.blocks.forEach((block, index) => {
            assert.ok(
                block.count <= localOptions.maxBlock,
                `Block ${index} count ${block.count} exceeds maxBlock limit of ${localOptions.maxBlock}`,
            );
        });

        // Should have created multiple blocks due to the 20-register limit
        assert.ok(result.blocks.length > 1);
    });

    it('should handle boolean scenario from original issue', function () {
        // Simulate consecutive boolean registers that were creating blocks > 30
        const result = {
            config: [],
        };

        // Create 50 consecutive coil registers
        for (let addr = 7040; addr <= 7090; addr++) {
            result.config.push({ deviceId: 1, address: addr, len: 1 });
        }

        const localOptions = {
            maxBlock: 100,
            maxBoolBlock: 30,
        };

        iterateAddresses(true, 1, result, 'coils', 'coils', localOptions);

        // All blocks should respect the maxBoolBlock limit of 30
        result.blocks.forEach((block, index) => {
            assert.ok(
                block.count <= localOptions.maxBoolBlock,
                `Block ${index} count ${block.count} exceeds maxBoolBlock limit of ${localOptions.maxBoolBlock}`,
            );
        });

        // Should have created multiple blocks due to the 30-register limit
        assert.ok(result.blocks.length > 1);
    });

    it('should split blocks correctly when approaching limit', function () {
        const result = {
            config: [
                { deviceId: 1, address: 4000, len: 18, type: 'floatbe' }, // 18 registers
                { deviceId: 1, address: 4018, len: 5, type: 'floatbe' }, // would make 23 total, exceeds 20
            ],
        };

        const localOptions = {
            maxBlock: 20,
            maxBoolBlock: 128,
        };

        iterateAddresses(false, 1, result, 'holdingRegisters', 'holdingRegs', localOptions);

        // Should create two blocks
        assert.strictEqual(result.blocks.length, 2);
        assert.strictEqual(result.blocks[0].count, 18); // First block
        assert.strictEqual(result.blocks[1].count, 5); // Second block
    });
});

describe('Bool address alignment to 16 bit', function () {
    // Previous ("old") behaviour: rounding addressLow down to a 16-bit boundary
    // without growing the length -> the aligned block no longer reached the upper
    // end of the original address range.
    function alignOld(result) {
        result.addressLow = (result.addressLow >> 4) << 4;
        if (result.length % 16) {
            result.length = ((result.length >> 4) + 1) << 4;
        }
        for (const block of result.blocks) {
            block.start = (block.start >> 4) << 4;
            if (block.count % 16) {
                block.count = ((block.count >> 4) + 1) << 4;
            }
        }
        result.addressEnd = result.addressLow + result.length;
        result.blocks[0].end = result.blocks[0].start + result.blocks[0].count;
        return result;
    }

    // Current ("new") behaviour: the length is increased by the alignment offset,
    // so the aligned block still covers the whole original range.
    function alignNew(result) {
        const oldStart = result.addressLow;
        result.addressLow = (result.addressLow >> 4) << 4;
        result.length += oldStart - result.addressLow;
        if (result.length % 16) {
            result.length = ((result.length >> 4) + 1) << 4;
        }
        for (const block of result.blocks) {
            const blockOldStart = block.start;
            block.start = (block.start >> 4) << 4;
            block.count += blockOldStart - block.start;
            if (block.count % 16) {
                block.count = ((block.count >> 4) + 1) << 4;
            }
        }
        result.addressEnd = result.addressLow + result.length;
        result.blocks[0].end = result.blocks[0].start + result.blocks[0].count;
        return result;
    }

    // Original range: addresses 30..60 (addressLow=30, length=30).
    const makeInput = () => ({
        addressLow: 30,
        length: 30,
        blocks: [{ start: 30, count: 30, end: 60 }],
        addressEnd: 60,
    });

    it('new alignment still covers the original address range (30..60)', function () {
        const aligned = alignNew(makeInput());

        // 30 rounds down to 16; length grows by 14 to compensate and rounds up to 48.
        assert.strictEqual(aligned.addressLow, 16);
        assert.strictEqual(aligned.length, 48);
        assert.strictEqual(aligned.addressEnd, 64);
        assert.strictEqual(aligned.blocks[0].start, 16);
        assert.strictEqual(aligned.blocks[0].count, 48);
        assert.strictEqual(aligned.blocks[0].end, 64);

        // The aligned range must fully contain the original 30..60 range.
        assert.ok(aligned.addressLow <= 30, 'aligned start must not exceed original start');
        assert.ok(aligned.addressEnd >= 60, 'aligned end must cover original end');
        assert.ok(aligned.blocks[0].end >= 60, 'aligned block end must cover original end');
    });

    it('old alignment failed to cover the upper end of the range', function () {
        const aligned = alignOld(makeInput());

        // Old behaviour: 16..48 no longer reaches the original end address 60.
        assert.strictEqual(aligned.addressLow, 16);
        assert.strictEqual(aligned.addressEnd, 48);
        assert.ok(aligned.addressEnd < 60, 'documents the bug the new alignment fixes');
    });
});

module.exports = {
    iterateAddresses,
};
