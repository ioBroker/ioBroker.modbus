import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';
import pkg from '../package.json';

declare global {
    interface Window {
        sentryDSN: string;
        adapterName: string | undefined;
    }
}

window.adapterName = 'modbus';
window.sentryDSN = 'https://19469f9280bd4b18a3e960e79cb01df2@sentry.iobroker.net/196';

console.log(`iobroker.${window.adapterName}@${pkg.version}`);

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: http://bit.ly/CRA-PWA
serviceWorker.unregister();
