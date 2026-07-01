/*
 * Simple UNIT test for the modbus adapter using @iobroker/testing.
 * Assertions use node:assert only (no chai).
 *
 * Idea:
 *   No real js-controller is started. Instead @iobroker/testing creates
 *     - an in-memory database (objects/states stored in a Map) and
 *     - a mock of the Adapter class connected to that database.
 *   All adapter.setState/getState/setObject/... calls operate on that DB,
 *   so from the test we can write and read objects/states and then verify
 *   them - fast and without any hardware/network.
 *
 * Note:
 *   The predefined utils.unit.createAsserts(...) are intentionally NOT used
 *   here, because they rely on chai (should style). Instead we read the
 *   values directly via the adapter or the database and check them with
 *   node:assert.
 *
 * Run:
 *   npx mocha test/testUnit.js
 */
const assert = require('node:assert');
const { utils } = require('@iobroker/testing');

describe('modbus - unit test (mock adapter, no js-controller)', () => {
    // database = in-memory objects/states DB
    // adapter  = mock of the Adapter class, connected to that DB
    // With name: 'modbus' the namespace becomes "modbus.0".
    const { adapter, database } = utils.unit.createMocks({ name: 'modbus' });

    // Reset everything after each test -> tests stay independent of each other.
    afterEach(() => {
        database.clear(); // remove all objects + states
        adapter.resetMockHistory(); // forget which stubs were called and how often
    });

    it('creates an object and reads it back', async () => {
        // Write (short ID; "modbus.0." is prepended automatically)
        await adapter.setObjectAsync('holdingRegisters.40001', {
            type: 'state',
            common: {
                name: 'Temperature',
                type: 'number',
                role: 'value.temperature',
                unit: '°C',
                read: true,
                write: false,
            },
            native: { address: 40001 },
        });

        // Variant A: read via the adapter
        const obj = await adapter.getObjectAsync('holdingRegisters.40001');
        assert.ok(obj, 'object should exist');
        assert.strictEqual(obj.common.name, 'Temperature');
        assert.strictEqual(obj.common.unit, '°C');

        // Variant B: look directly into the DB (full ID incl. namespace here)
        assert.ok(database.hasObject('modbus.0.holdingRegisters.40001'), 'object missing in the DB');
    });

    it('writes and reads a state (value + ack flag)', async () => {
        // setState(id, val, ack): val=21.5, ack=true (confirmed actual value)
        await adapter.setStateAsync('holdingRegisters.40001', 21.5, true);

        // Read via the adapter
        const state = await adapter.getStateAsync('holdingRegisters.40001');
        assert.strictEqual(state.val, 21.5);
        assert.strictEqual(state.ack, true);
    });

    it('a control command arrives with ack=false', async () => {
        // A "command from above" (e.g. from the UI) typically has ack=false.
        await adapter.setStateAsync('coils.1', { val: true, ack: false });

        const state = await adapter.getStateAsync('coils.1');
        assert.strictEqual(state.val, true);
        assert.strictEqual(state.ack, false);
    });

    it('pre-fills the DB directly (initial state without an adapter call)', async () => {
        // The DB can also be filled directly - handy to set up an initial
        // state for the test (full ID incl. namespace here).
        database.publishState('modbus.0.info.connection', { val: false, ack: true });

        // The short ID on read is expanded back to "modbus.0.info.connection".
        const state = await adapter.getStateAsync('info.connection');
        assert.strictEqual(state.val, false);
    });
});
