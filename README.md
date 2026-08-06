[![CI](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml/badge.svg)](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40fa_yoshinobu%2Fnode-red-contrib-plc-comm-kvhostlink?logo=npm&color=CB3837)](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/LICENSE)

# Node-RED KEYENCE KV Host Link Nodes

Node-RED nodes for KEYENCE KV PLC communication via Host Link.

## PLC Comm Family

This library is part of the plc-comm family. See the [package matrix](https://fa-yoshinobu.github.io/plc-comm-docs-site/package-matrix/) for protocol, language, registry, and install-command mapping.

## Supported PLC profiles

The maintained profile table is in [PLC profiles](https://fa-yoshinobu.github.io/plc-comm-docs-site/hostlink/nodered/PROFILES/). Choose one exact canonical PLC profile from that table.

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
9. On a controlled test PLC/address only, optionally trigger `Test DM100:U (random + restore)`.
10. The write path first saves the original value, writes a random different unsigned value, restores the original, and reads again. Restoration is best effort and can be interrupted by a transport or PLC failure.

Address and integer input is strict. Each high-level address must match one
complete supported form; extra selectors or trailing text and incompatible
`BIT`, `F`, or `COMMENT` selectors fail before connection or transport. Direct
client integer arguments must be safe JavaScript integers. Configuration-node
port and timeout text is converted explicitly at the Node-RED boundary.
Connections are IPv4-only. The ordinary client serializes admitted operations
in strict FIFO order, uses one absolute active transaction deadline, and never
automatically reconnects or retries. Direct-bit writes require JavaScript
Booleans. The library's explicit Boolean-only `writeBitInWord` API performs a
two-request, non-PLC-atomic word update; it is never selected implicitly by a
Node-RED named write. `writeBitInExpansionUnitBuffer` applies the same explicit
contract to one `.U` word on an immutable expansion-unit URD/UWR route.

Float32 selectors require ordinary one-word device families; native 32-bit `Z`
devices reject `:F` before FIFO admission or transport. Semantic `.H` reads
return exactly four uppercase hexadecimal digits. Raw responses and hexadecimal
write framing are not normalized by that read contract.

RDC device comments are byte payloads until the caller makes an explicit
choice. For decoded text, select exactly `utf8` or `cp932`; `cp932` means
Windows-31J compatibility commonly described by KEYENCE as Shift_JIS. There is
no automatic/profile codec and no separate strict Shift_JIS alias. When the
stored encoding is unknown, select raw Buffer output. Malformed text bytes fail
strictly without fallback or replacement characters.

Malformed response bytes, an unknown operating-mode response, and stale or extra
TCP response lines invalidate the TCP connection that produced them. UDP keeps
the explicit logical connection and reuses a successful socket, resolved IPv4
address, and local endpoint across requests. Timeout, cancellation, malformed or
additional response data, an unowned datagram, and socket failure close that
physical socket; the next request creates a replacement without repeating DNS
resolution. A failed request is never retried or replayed automatically.

## Documentation

| Page | Use it for |
| --- | --- |
| [Full documentation site](https://fa-yoshinobu.github.io/plc-comm-docs-site/) | Unified docs for all PLC communication libraries. |
| [Getting started](https://fa-yoshinobu.github.io/plc-comm-docs-site/hostlink/nodered/GETTING_STARTED/) | Install the nodes, configure a connection, and run your first flow. |
| [Usage guide](https://fa-yoshinobu.github.io/plc-comm-docs-site/hostlink/nodered/USAGE_GUIDE/) | Use read/write nodes, metadata modes, connection control, and flow patterns. |
| [API reference](https://fa-yoshinobu.github.io/plc-comm-docs-site/hostlink/nodered/API_REFERENCE/) | Find public client methods, helpers, profile APIs, and error types. |
| [PLC profiles](https://fa-yoshinobu.github.io/plc-comm-docs-site/hostlink/nodered/PROFILES/) | Choose the canonical profile for the target KV family. |
| [KV Host Link Device Ranges](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/device-ranges/) | Check shared device families, address notation, and range tables. |
| [KV Host Link Troubleshooting & Codes](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/troubleshooting-codes/) | Troubleshoot common port, profile, address, write-permission, and PLC error-code symptoms. |
| [Gotchas](https://fa-yoshinobu.github.io/plc-comm-docs-site/hostlink/nodered/GOTCHAS/) | Check whether this library has any current library-specific caveats. |
| [Performance](https://fa-yoshinobu.github.io/plc-comm-docs-site/performance/) | See measured latency, throughput, and long-run soak results from real PLC hardware. |
| [Choosing a Language](https://fa-yoshinobu.github.io/plc-comm-docs-site/choosing-a-language/) | Compare the .NET, Python, Rust, C++, and Node-RED implementations before you pick one. |
| [Example flows](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/examples/flows/README.md) | Import maintained Node-RED example flows. |

For a zero-code connectivity check, see [PLC Scope](https://github.com/fa-yoshinobu/plc-scope-dotnet) (Windows).

## License and registry

| Item | Value |
| --- | --- |
| License | [MIT](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/LICENSE) |
| Registry | [npm](https://www.npmjs.com/package/@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink) |
| Package | `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` |

## Commercial support

If you plan to embed this library in a paid or commercial product, please consider a separate support agreement or supporting the project as a sponsor.

Contact: <https://fa-labo.com/contact.html>
