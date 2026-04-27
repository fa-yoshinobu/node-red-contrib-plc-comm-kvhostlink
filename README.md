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
2. Add one `kvhostlink-connection` config node and set `host`, `port`, `transport`, `timeout`, and `Append LF` as needed.
3. Import [`kvhostlink-basic-read-write.json`](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-basic-read-write.json) for the first smoke test.
4. When scalar read/write works, move to [`kvhostlink-typed-read-write.json`](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-typed-read-write.json) and [`kvhostlink-array-read-write.json`](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-array-read-write.json).
5. Use [`kvhostlink-device-matrix.json`](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-device-matrix.json) only after the basics are stable.

## Release information

- package name: `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink`
- package version: `0.2.3`
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

Optional local editor smoke test from the repository root:

```bash
npm run smoke:editor
```

This command installs the local package into an isolated temporary userDir, starts a temporary Node-RED runtime, imports `kvhostlink-basic-read-write.json`, verifies the flow starts, and then shuts the runtime down again.

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
- explicit connection options for `host`, `port`, `transport`, `timeout`, and `append LF on send`
- `kvhostlink-read` powered by the high-level helper API
- `kvhostlink-write` powered by the high-level helper API
- high-level scalar, signed, dword, long, float, bit-in-word, and `,count` forms
- comment read helper and `:COMMENT` snapshot form
- metadata emission modes for `msg.kvhostlink`: `full` / `minimal` / `off`
- connection control via `connect` / `disconnect` / `reinitialize` messages
- matrix-style debug flow with JSONL result logging
- beginner-oriented sample flows for scalar, typed, and array patterns
- local tests for protocol parsing and high-level helper behavior
- helper exports also include `normalizeAddress`, `formatParsedAddress`, and `normalizeAddressList` for canonical address handling
- helper exports include `deviceRangeCatalogForModel()` and `client.readDeviceRangeCatalog()` for model-specific published ranges
- optional local runtime smoke validation via `npm run smoke:editor`
- local Node-RED runtime smoke test confirmed the basic flow loads and starts successfully

Supported high-level address forms include:

- `DM100`
- `DM110:S`
- `DM120:D`
- `DM130:L`
- `DM140:F`
- `DM145:COMMENT`
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

- [kvhostlink-basic-read-write.json](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-basic-read-write.json)
  First-step scalar read/write flow.
- [kvhostlink-typed-read-write.json](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-typed-read-write.json)
  Signed, dword, long, float, and bit-in-word examples.
- [kvhostlink-array-read-write.json](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-array-read-write.json)
  `,count` read/write examples for words and bits.
- [kvhostlink-device-matrix.json](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/kvhostlink-device-matrix.json)
  High-level matrix-style verification flow. Completed results are appended to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Connection and runtime behavior

Connection settings on `kvhostlink-connection`:

- host
- port
- transport: `tcp` or `udp`
- timeout in milliseconds
- `Append LF on send`

Read and write nodes support:

- full or minimal `msg.kvhostlink` metadata, or leaving it unchanged
- `msg.connect`, `msg.disconnect`, and `msg.reinitialize`
- `msg.topic = "connect" | "disconnect" | "reinitialize"`

The read and write nodes keep the caller-visible logical request shape and do not silently retry one logical request as a different fallback split operation.

Comment reads use the Host Link `RDC` command and return strings in the same payload shapes as other read values.

XYM aliases are also accepted for comment reads, so forms such as `D10:COMMENT`, `M20:COMMENT`, and `X100:COMMENT` are valid.

## Known limitations

- `AT` remains pending support and is tracked in [TODO.md](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/TODO.md).
- The package now has beginner flows, but the validation coverage and example breadth are still narrower than `node-red-contrib-plc-comm-slmp`.

