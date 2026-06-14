[![CI](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml/badge.svg)](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
[![npm downloads](https://img.shields.io/npm/dm/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
![License](https://img.shields.io/badge/License-MIT-1F6FEB)

![Node-RED version](https://img.shields.io/badge/Node--RED-%E2%89%A53.0-B41F27?logo=nodered&logoColor=white)
![Node.js version](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)
![Protocol](https://img.shields.io/badge/Protocol-KV%20Host%20Link-0A7D5C)
![Transport](https://img.shields.io/badge/Transport-TCP%20%2F%20UDP-005BAC)

# Node-RED KEYENCE KV Host Link Nodes

Node-RED nodes for KEYENCE KV PLC communication via Host Link.

## Supported PLC profiles

The maintained profile table is in [PLC profiles](docsrc/user/PROFILES.md). Choose one exact canonical PLC profile from that table.

## Supported device types

The maintained device and range tables are in [Supported registers](docsrc/user/SUPPORTED_REGISTERS.md). Use that page for supported device families, address syntax, and profile-specific notes.

## Installation

```text
@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink
```

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
6. Set **PLC Profile** to the exact canonical profile for your PLC, such as `keyence:kv-5000`.
7. Deploy the flow.
8. Trigger `Read DM100` and check the debug sidebar.
9. Trigger `Write DM100=123`, then read again to confirm the value.

## Documentation

| Page | Use it for |
| --- | --- |
| [Full documentation site](https://fa-yoshinobu.github.io/plc-comm-docs-site/) | Unified docs for all PLC communication libraries. |
| [Getting started](docsrc/user/GETTING_STARTED.md) | Install the nodes, configure a connection, and run your first flow. |
| [Usage guide](docsrc/user/USAGE_GUIDE.md) | Use read/write nodes, metadata modes, connection control, and flow patterns. |
| [Supported registers](docsrc/user/SUPPORTED_REGISTERS.md) | Check device families, address ranges, and numbering rules. |
| [PLC profiles](docsrc/user/PROFILES.md) | Choose the canonical profile for the target KV family. |
| [Gotchas](docsrc/user/GOTCHAS.md) | Troubleshoot common profile, address, timer/counter, and transport issues. |
| [Example flows](examples/flows/README.md) | Import maintained Node-RED example flows. |

## Hardware verified

Live-device verification is maintained in [Latest communication verification](docsrc/user/LATEST_COMMUNICATION_VERIFICATION.md).
See that page for verified PLC models, transports, dates, limitations, and retained validation notes.

## License and registry

| Item | Value |
| --- | --- |
| License | [MIT](LICENSE) |
| Registry | [npm](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink) |
| Package | `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` |
