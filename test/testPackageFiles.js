const path = require('node:path');
const { tests } = require('@iobroker/testing');

// Validate the package files (package.json and io-package.json) using @iobroker/testing.
tests.packageFiles(path.join(__dirname, '..'));
