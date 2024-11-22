const { renameSync } = require('node:fs');
const { deleteFoldersRecursive, copyFiles, npmInstall, buildReact, patchHtmlFile } = require('@iobroker/build-tools');

function clean() {
    deleteFoldersRecursive(`${__dirname}/admin`, ['modbus.png']);
}

function copyAllFiles() {
    copyFiles(
        ['src/build/*/**', 'src/build/*', '!src/build/static/media/*.svg', '!src/build/static/media/*.txt'],
        'admin/',
    );
}

function patch() {
    return patchHtmlFile(`${__dirname}/admin/index.html`).then(() => {
        renameSync(`${__dirname}/admin/index.html`, `${__dirname}/admin/index_m.html`);
    });
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(`${__dirname}/src`).catch(e => {
        console.error(`Cannot install npm: ${e}`);
        process.exit(1);
    });
} else if (process.argv.includes('--2-build')) {
    buildReact(`${__dirname}/src/`, {
        rootDir: __dirname,
        vite: true,
    }).catch(e => {
        console.error(`Cannot build react: ${e}`);
        process.exit(1);
    });
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else if (process.argv.includes('--4-patch')) {
    patchHtmlFile(`${__dirname}/admin/index.html`)
        .then(() => {
            renameSync(`${__dirname}/admin/index.html`, `${__dirname}/admin/index_m.html`);
        })
        .catch(e => {
            console.error(`Cannot patch: ${e}`);
            process.exit(1);
        });
} else if (process.argv.includes('--build')) {
    clean();
    npmInstall(`${__dirname}/src`)
        .then(() =>
            buildReact(`${__dirname}/src/`, {
                rootDir: __dirname,
                vite: true,
            }),
        )
        .then(() => copyAllFiles())
        .then(() => patch())
        .catch(e => {
            console.error(`Cannot build: ${e}`);
            process.exit(1);
        });
} else {
    clean();

    npmInstall(`${__dirname}/src`)
        .then(() =>
            buildReact(`${__dirname}/src/`, {
                rootDir: __dirname,
                vite: true,
            }),
        )
        .then(() => copyAllFiles())
        .then(() => patch())
        .catch(e => {
            console.error(`Cannot build admin controls: ${e}`);
            process.exit(1);
        });
}
