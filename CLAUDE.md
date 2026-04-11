# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.modbus is a Node.js adapter implementing Modbus master and slave for the ioBroker home automation platform. It supports Modbus TCP, RTU over serial, RTU over TCP, and TCP with SSL/TLS. Includes a React-based admin UI for configuration.

## Commands

```bash
npm install                  # Install root dependencies
npm run npm                  # Install root + frontend (src-admin) dependencies
npm run build                # Full build: TypeScript backend + React admin UI (~40s, do not cancel)
npm run build-backend        # TypeScript backend compilation only
npm run lint                 # ESLint (only checks src/ TypeScript, ignores src-admin/admin/test/build)
npm test                     # Integration tests via mocha (~60s, do not cancel)
npm run test:package         # Package structure validation
npm run test:integration     # Same as npm test (mocha test/testAdapter.js --exit)
```

Individual admin UI build steps (via `node tasks.js`):
- `npm run 0-clean` - Clean admin/ directory (preserves modbus.png)
- `npm run 1-npm` - Install src-admin/ dependencies
- `npm run 2-build` - Vite build of React app
- `npm run 3-copy` - Copy build artifacts to admin/
- `npm run 4-patch` - Rename index.html to index_m.html for ioBroker

## Architecture

### Backend

The adapter entry point is `src/main.ts`, which compiles to `build/main.js`. The `ModbusAdapter` class extends `ModbusTemplate` from `@iobroker/modbus` (the external library that contains all Modbus protocol logic including Master, Slave, serial/TCP transports, and the custom jsmodbus implementation). The adapter itself is thin -- it only handles backwards compatibility for renamed config params (`pulsetime` -> `pulseTime`, `bind` -> `host`).

All core Modbus logic (master polling, slave serving, protocol transports, CRC, register handling) lives in the `@iobroker/modbus` npm package, not in this repo.

Supports compact mode (all-in-one) and standalone daemon mode.

### Admin UI (src-admin/)

React 18 + Material-UI v6 + Vite application. Uses `@iobroker/adapter-react-v5` for ioBroker admin integration.

- `src-admin/src/App.tsx` - Main tabbed interface
- `src-admin/src/Tabs/` - Configuration tabs: Connection, Settings, DiscreteInputs, Coils, InputRegisters, HoldingRegisters
- `src-admin/src/Components/` - RegisterTable, TsvDialog, DeleteDialog, Utils
- `src-admin/src/i18n/` - 11 language files (en, de, ru, pt, nl, fr, it, es, pl, uk, zh-cn)
- `src-admin/src/data/` - Static data (roles.json, types.json for Modbus data types)

Build output goes to `admin/` directory. The admin UI dev server runs on port 3000 with proxy to localhost:8081.

### Register Types (Modbus spec)

Four register types configurable in admin UI, each with address ranges:
- Discrete Inputs (10001-20000) - read-only binary
- Coils (1-10000) - read/write binary
- Input Registers (30001-40000) - read-only 16+ bit
- Holding Registers (40001-60000) - read/write 16+ bit

28 data types supported: uint8/16/32/64, int8/16/32/64, float, double -- each with big-endian, little-endian, word-swap, and byte-swap variants, plus strings.

## Key Configuration

- `io-package.json` - Adapter metadata, default native config, dependency requirements (js-controller >=6.0.11, admin >=6.17.14)
- `tsconfig.json` - Type checking only (noEmit: true), target ES2022, module Node16, strict
- `tsconfig.build.json` - Extends tsconfig.json, enables emit to `./build/`
- `eslint.config.mjs` - Uses `@iobroker/eslint-config`, ignores src-admin/, admin/, test/, build/, tasks.js

## Requirements

- Node.js >= 20 (CI tests on 20.x, 22.x, 24.x)
- `serialport` is an optional dependency (for serial Modbus communication)

## Validation Checklist

After changes, run: `npm run lint`, `npm run build`, `npm test`

## Release

```bash
npm run release-patch    # Patch version bump + release
npm run release-minor    # Minor version bump + release
npm run release-major    # Major version bump + release
```

Pre-commit hook runs `npm run build`. CI deploys to npm on version tags (`v*`).
