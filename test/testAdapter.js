const expect = require('chai').expect;
const setup = require('@iobroker/legacy-testing');

let objects = null;
let states  = null;
let onStateChanged = null;
let sendToID = 1;

const adapterShortName = setup.adapterName.substring(setup.adapterName.indexOf('.')+1);

function checkConnectionOfAdapter(cb, counter) {
    counter = counter || 0;
    console.log(`Try check #${counter}`);
    if (counter > 30) {
        if (cb) cb('Cannot check connection');
        return;
    }

    states.getState(`system.adapter.${adapterShortName}.0.alive`, (err, state) => {
        if (err) console.error(err);
        if (state && state.val) {
            if (cb) {
                cb();
            }
        } else {
            setTimeout(() =>
                checkConnectionOfAdapter(cb, counter + 1), 1000);
        }
    });
}

function checkValueOfState(id, value, cb, counter) {
    counter = counter || 0;
    if (counter > 20) {
        if (cb) {
            cb(`Cannot check value Of State ${id}`);
        }
        return;
    }

    states.getState(id, (err, state) => {
        if (err) {
            console.error(err);
        }
        if (value === null && !state) {
            if (cb) {
                cb();
            }
        } else
        if (state && (value === undefined || state.val === value)) {
            if (cb) {
                cb();
            }
        } else {
            setTimeout(() => {
                checkValueOfState(id, value, cb, counter + 1);
            }, 500);
        }
    });
}

describe(`Test ${adapterShortName} adapter`, function () {
    before(`Test ${adapterShortName} adapter: Start js-controller`, function (_done) {
        _done();
        return;
        this.timeout(600000); // because of the first installation from npm

        setup.setupController(async () => {
            const config = await setup.getAdapterConfig();
            // enable adapter
            config.common.enabled  = true;
            config.common.loglevel = 'debug';

            //config.native.dbtype   = 'sqlite';

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController(
                true,
                (id, obj) => {},
                (id, state) => {
                    if (onStateChanged) {
                        onStateChanged(id, state);
                    }
                },
                (_objects, _states) => {
                    objects = _objects;
                    states  = _states;
                    _done();
                });
        });
    });

/*
    ENABLE THIS WHEN ADAPTER RUNS IN DEMON MODE TO CHECK THAT IT HAS STARTED SUCCESSFULLY
*/
    it(`Test ${adapterShortName} adapter: Check if adapter started`, function (done) {
        this.timeout(60000);
        checkConnectionOfAdapter(res => {
            if (res) {
                console.log(res);
            }
            expect(res).not.to.be.equal('Cannot check connection');
            objects.setObject('system.adapter.test.0', {
                    common: {

                    },
                    type: 'instance'
                },
                () => {
                    states.subscribeMessage('system.adapter.test.0');
                    done();
                });
        });
    });

    it.only(`Test alignment`, function (done) {
        const isBools = true;
        const localOptions = {
            doNotRoundAddressToWord: false,
        };
        let result = {
            addressLow: 30,
            length: 30,
            blocks: [
                {
                    start: 30,
                    count: 30,
                    end: 30 + 30,
                }
            ],
            addressEnd: 30 + 30,
        };
        const oldData = JSON.parse(JSON.stringify(result));

        // old code
        if (isBools && !localOptions.doNotRoundAddressToWord) {
            // align addresses to 16 bit. E.g 30 => 16, 31 => 16, 32 => 32
            result.addressLow = (result.addressLow >> 4) << 4;

            // If the length is not a multiple of 16
            if (result.length % 16) {
                // then round it up to the next multiple of 16
                result.length = ((result.length >> 4) + 1) << 4;
            }

            if (result.blocks) {
                for (let b = 0; b < result.blocks.length; b++) {
                    result.blocks[b].start = (result.blocks[b].start >> 4) << 4;

                    if (result.blocks[b].count % 16) {
                        result.blocks[b].count = ((result.blocks[b].count >> 4) + 1) << 4;
                    }
                }
            }
        }

        result.addressEnd = result.addressLow + result.length;
        result.blocks[0].end = result.blocks[0].start + result.blocks[0].count;
        console.log(`${JSON.stringify(oldData)} => ${JSON.stringify(result)}`);

        result = {
            addressLow: 30,
            length: 30,
            blocks: [
                {
                    start: 30,
                    count: 30,
                    end: 30 + 30,
                },
            ],
            addressEnd: 30 + 30,
        };

        // new code
        if (isBools && !localOptions.doNotRoundAddressToWord) {
            const oldStart = result.addressLow;
            // align addresses to 16 bit. E.g 30 => 16, 31 => 16, 32 => 32
            result.addressLow = (result.addressLow >> 4) << 4;

            // increase the length on the alignment if any
            result.length += oldStart - result.addressLow;

            // If the length is not a multiple of 16
            if (result.length % 16) {
                // then round it up to the next multiple of 16
                result.length = ((result.length >> 4) + 1) << 4;
            }

            if (result.blocks) {
                for (let b = 0; b < result.blocks.length; b++) {
                    const _oldStart = result.blocks[b].start;
                    result.blocks[b].start = (result.blocks[b].start >> 4) << 4;

                    // increase the length on the alignment if any
                    result.blocks[b].count += (_oldStart - result.blocks[b].start);

                    if (result.blocks[b].count % 16) {
                        result.blocks[b].count = ((result.blocks[b].count >> 4) + 1) << 4;
                    }
                }
            }
        }
        result.addressEnd = result.addressLow + result.length;
        result.blocks[0].end = result.blocks[0].start + result.blocks[0].count;

        console.log(`${JSON.stringify(oldData)} => ${JSON.stringify(result)}`);
    });
/**/

/*
    PUT YOUR OWN TESTS HERE USING
    it('Testname', function ( done) {
        ...
    });

    You can also use "sendTo" method to send messages to the started adapter
*/

    after(`Test ${adapterShortName} adapter: Stop js-controller`, function (done) {
        this.timeout(10000);

        setup.stopController(normalTerminated => {
            console.log(`Adapter normal terminated: ${normalTerminated}`);
            done();
        });
    });
});
