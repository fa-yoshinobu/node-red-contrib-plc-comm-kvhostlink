# Node-RED KV Host Link Nodes for KEYENCE PLCs

[![CI](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml/badge.svg)](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
[![npm downloads](https://img.shields.io/npm/dm/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
![Node-RED version](https://img.shields.io/badge/Node--RED-%E2%89%A53.0-B41F27?logo=nodered&logoColor=white)
![Node.js version](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Protocol](https://img.shields.io/badge/Protocol-KV%20Host%20Link-0A7D5C)
![Transport](https://img.shields.io/badge/Transport-TCP%20%2F%20UDP-005BAC)
![License](https://img.shields.io/badge/License-MIT-1F6FEB)

![Node-RED KV Host Link hero](https://raw.githubusercontent.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/main/docsrc/assets/node-red-kv.png)

Node-RED nodes for KEYENCE KV series PLC communication over KV Host Link (Upper Link), using the same high-level read/write model as the existing Python and .NET libraries.

## Quick start

1. Install the package into your Node-RED user directory and restart Node-RED.
2. Add one `kvhostlink-connection` config node and set `host`, `port`, and `transport`.
3. Add `kvhostlink-read` and start with safe addresses such as `DM100`, `DM110:S`, or `DM160,4`.
4. When read works, add `kvhostlink-write` and validate with known-safe test devices before moving to production addresses.

If you are working from this repository, import the debug flow under [examples/flows](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/README.md) first.

## Release information

- package name: `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink`
- package version: `0.1.0`
- npm package: <https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink>
- Node-RED requirement: `>=3.0.0`
- Node.js requirement: `>=18`
- changelog: <https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/CHANGELOG.md>

Install from npm:

```bash
cd ~/.node-red
npm install @fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink
```

Install from this repository:

```bash
cd ~/.node-red
npm install /path/to/node-red-contrib-plc-comm-kvhostlink
```

## Documentation

- [User Guide](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/docsrc/user/USER_GUIDE.md)
- [Example Flows](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/README.md)
- [Future Device Support](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/TODO.md)
- [Maintainer Notes](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/docsrc/maintainer/ARCHITECTURE.md)
- [Validation Reports Directory](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/tree/main/docsrc/validation/reports)
- [Documentation Index](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/docsrc/index.md)

## Current scope

- TCP and UDP transport
- Reusable `kvhostlink-connection` config node
- `kvhostlink-read` powered by the high-level helper API
- `kvhostlink-write` powered by the high-level helper API
- high-level scalar, signed, dword, long, float, bit-in-word, and `,count` forms
- matrix-style debug flow with JSONL result logging
- Local tests for protocol parsing and high-level helper behavior

Supported high-level address forms include:

- `DM100`
- `DM110:S`
- `DM120:D`
- `DM130:L`
- `DM140:F`
- `DM150.3`
- `DM160,4`
- `R200,4`
- `T10:D`
- `C10:D`

Validated PLC model:

- `KV-7500`

## Supported devices

Supported bit devices:

- `R`, `B`, `MR`, `LR`, `CR`, `VB`
- `X`, `Y`, `M`, `L`

Supported word devices:

- `DM`, `EM`, `FM`, `ZF`, `W`, `TM`, `Z`
- `TC`, `TS`, `CC`, `CS`
- `CM`, `VM`
- `D`, `E`, `F`

Supported high-level timer and counter scalar forms:

- `Tn:D`
- `Cn:D`

## Example flows

- [kvhostlink-device-matrix.json](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-device-matrix.json)
  High-level matrix-style verification flow. Completed results are appended to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Known limitations

- `AT` remains pending support and is tracked in [TODO.md](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/TODO.md).
- The current sample set is smaller than the SLMP package. This package currently ships the matrix-style verification flow first.
- The package is publishable, but the documentation and sample coverage are not yet as broad as `node-red-contrib-plc-comm-slmp`.
