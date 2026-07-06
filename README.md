[![CI](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml/badge.svg)](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# Node-RED KEYENCE KV Host Link Nodes

Node-RED nodes for KEYENCE KV PLC communication via Host Link.

## PLC Comm Family

This library is part of the plc-comm family. See the [package matrix](https://fa-yoshinobu.github.io/plc-comm-docs-site/package-matrix/) for protocol, language, registry, and install-command mapping.

## Supported PLC profiles

The maintained profile table is in [PLC profiles](docsrc/user/PROFILES.md). Choose one exact canonical PLC profile from that table.

## Supported device types

The shared device and range tables are in the [KV Host Link Device Ranges](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/device-ranges/) page. Use that page for supported device families, address syntax, and profile-specific notes.

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
8. Trigger `Read DM100:U` and check the debug sidebar.
9. Trigger `Write DM100:U=123`, then read again to confirm the value.
10. The starter flow does not restore the previous value; use only a test address or add a restore write before production use.

## Documentation

| Page | Use it for |
| --- | --- |
| [Full documentation site](https://fa-yoshinobu.github.io/plc-comm-docs-site/) | Unified docs for all PLC communication libraries. |
| [Getting started](docsrc/user/GETTING_STARTED.md) | Install the nodes, configure a connection, and run your first flow. |
| [Usage guide](docsrc/user/USAGE_GUIDE.md) | Use read/write nodes, metadata modes, connection control, and flow patterns. |
| [API reference](docsrc/user/API_REFERENCE.md) | Find public client methods, helpers, profile APIs, and error types. |
| [PLC profiles](docsrc/user/PROFILES.md) | Choose the canonical profile for the target KV family. |
| [KV Host Link Device Ranges](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/device-ranges/) | Check shared device families, address notation, and range tables. |
| [KV Host Link Troubleshooting & Codes](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/troubleshooting-codes/) | Troubleshoot common port, profile, address, write-permission, and PLC error-code symptoms. |
| [Gotchas](docsrc/user/GOTCHAS.md) | Check whether this library has any current library-specific caveats. |
| [Example flows](examples/flows/README.md) | Import maintained Node-RED example flows. |

## License and registry

| Item | Value |
| --- | --- |
| License | [MIT](LICENSE) |
| Registry | [npm](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink) |
| Package | `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` |

## Commercial support

If you plan to embed this library in a paid or commercial product, please consider a separate support agreement or supporting the project as a sponsor.

Contact: <https://fa-labo.com/contact.html>
