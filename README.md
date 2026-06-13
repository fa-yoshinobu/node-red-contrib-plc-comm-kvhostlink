[![CI](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml/badge.svg)](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
[![npm downloads](https://img.shields.io/npm/dm/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
![License](https://img.shields.io/badge/License-MIT-1F6FEB)

![Node-RED version](https://img.shields.io/badge/Node--RED-%E2%89%A53.0-B41F27?logo=nodered&logoColor=white)
![Node.js version](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Protocol](https://img.shields.io/badge/Protocol-KV%20Host%20Link-0A7D5C)
![Transport](https://img.shields.io/badge/Transport-TCP%20%2F%20UDP-005BAC)

# Node-RED KV Host Link Nodes for KEYENCE PLCs

Node-RED nodes for KEYENCE KV PLC communication via Host Link.

## Supported KV models

The connection node accepts these PLC profile values.

| PLC profile | Intended KV family |
| --- | --- |
| `keyence:kv-nano` | KV Nano |
| `keyence:kv-nano-xym` | KV Nano with XYM-style addressing |
| `keyence:kv-3000-5000` | KV-3000 / KV-5000 family |
| `keyence:kv-3000-5000-xym` | KV-3000 / KV-5000 family with XYM-style addressing |
| `keyence:kv-7000` | KV-7000 family |
| `keyence:kv-7000-xym` | KV-7000 family with XYM-style addressing |
| `keyence:kv-8000` | KV-8000 family |
| `keyence:kv-8000-xym` | KV-8000 family with XYM-style addressing |
| `keyence:kv-x500` | KV-X500 family |
| `keyence:kv-x500-xym` | KV-X500 family with XYM-style addressing |

## Supported device types

Commonly used families include:

| Family | Use |
| --- | --- |
| `DM`, `EM`, `FM` | Word data memory |
| `W`, `TM`, `Z` | Link relay words, timer monitor words, and index registers |
| `R`, `MR`, `LR`, `CR` | Bit-bank relay families |
| `X`, `Y` | Input and output bits |
| `M`, `L` | Internal bit aliases |
| `T`, `C` | Timer and counter preset values |
| `TC`, `TS`, `CC`, `CS` | Timer and counter current/contact families |
| `CM`, `VM` | Control and variable memory words |

See [supported registers](docsrc/user/SUPPORTED_REGISTERS.md) for the complete list and address rules.

## Installation

In Node-RED, open **Manage palette**, choose **Install**, and search for:

```text
@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink
```

Install the package, then restart Node-RED if your runtime asks you to.

## Quick start

1. Open the Node-RED import menu.
2. Import `examples/flows/kvhostlink-basic-read-write.json`.
3. Open the `kvhostlink-connection` config node.
4. Set **Host** to `192.168.250.100`.
5. Set **Port** to `8501`.
6. Deploy the flow.
7. Trigger `Read DM100` and check the debug sidebar.
8. Trigger `Write DM100=123`, then read again to confirm the value.

## Documentation

- [Getting started](docsrc/user/GETTING_STARTED.md)
- [Usage guide](docsrc/user/USAGE_GUIDE.md)
- [Supported registers](docsrc/user/SUPPORTED_REGISTERS.md)
- [PLC profiles](docsrc/user/PROFILES.md)
- [Example flows](examples/flows/README.md)

## Hardware verified

The latest retained Node-RED matrix result is from `2026-05-02` on a KV-5000 class target: 35 catalog samples produced 157 completed JSONL records, all marked `OK`.
Additional notes record KV-7500 checks for `AT` digital trimmer reads on `2026-05-14`.

## License and registry

- License: MIT
- npm package: <https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink>
- Package name: `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink`
