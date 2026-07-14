# Usage guide

## Available nodes

| Node | Purpose |
| --- | --- |
| `kvhostlink-connection` | Shared KEYENCE KV Host Link TCP/UDP connection config. |
| `kvhostlink-read` | Reads one or more high-level addresses into `msg.payload`. |
| `kvhostlink-write` | Writes one or more high-level address/value updates. |

## kvhostlink-connection config node

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| Name | No | Empty | Display-only label. Empty/whitespace/non-string values mean no custom label; duplicates are allowed and never identify a connection or PLC route. |
| Host | Yes | Empty | PLC host name or IP address. |
| Port | Yes | `8501` | TCP or UDP port. |
| Transport | Yes | `tcp` | `tcp` or `udp`. |
| Timeout ms | Yes | `3000` | Response timeout in milliseconds. |
| PLC Profile | Yes | `keyence:kv-x500` | Canonical lowercase profile value. |

Accepted profile values are listed in [PLC profiles](PROFILES.md).
The values shown in a newly created editor node are initial form values. A
saved flow must retain explicit port and transport fields; the runtime does not
repair missing values.

## Performance notes

For stable local networks, UDP usually has the lowest latency. TCP is the safer
default for remote or less predictable networks because the OS handles
retransmission.

Reuse one `kvhostlink-connection` config node for repeated reads and writes.
Prefer reading one address list or one array address over many separate
single-address messages when one application snapshot can be read together.

## Connection reuse and concurrent requests

Share one `kvhostlink-connection` config node between read and write nodes that
talk to the same PLC endpoint. Requests through the shared connection are queued
so concurrent Node-RED messages do not interleave Host Link frames on one
connection.

Use the connection control messages `connect`, `disconnect`, and `reinitialize`
for deliberate connection control. Create separate connection config nodes only
when you intentionally want separate PLC sessions.

## kvhostlink-read node

| Config field | Description |
| --- | --- |
| Name | Optional display-only label; it is not sent, emitted as metadata, or used as the connection identity. |
| Connection | `kvhostlink-connection` config node. |
| Source | Literal text, `msg`, `flow`, `global`, or `env`. |
| Addresses | Literal address list when Source is `str`. |
| Output | `object` always returns an address-keyed object, `array` always returns an array, and `value` requires exactly one address. |
| Metadata | `full`, `minimal`, or `off`. |
| Errors | `throw`, `msg.error`, or second output. |

| Input msg field | Description |
| --- | --- |
| `msg.addresses` | When present, a non-empty string or an array containing only non-empty address strings. Invalid input fails and never falls back to the configured source. |
| `msg.topic` | `connect`, `disconnect`, or `reinitialize` for connection control. |
| `msg.connect` | Set to `true` to connect. |
| `msg.disconnect` | Set to `true` to disconnect. |
| `msg.reinitialize` | Set to `true` to close and reconnect. |

| Output msg field | Description |
| --- | --- |
| `msg.payload` | Read result as an object, array, or scalar value. |
| `msg.kvhostlink` | Metadata when enabled. |
| `msg.error` | Error object when Errors is `msg.error`. |

The configured Source type is required. If a `msg`, `flow`, `global`, or `env`
reference cannot be evaluated, the operation fails before connecting; the
reference name is never treated as a literal PLC address or update.

## kvhostlink-write node

| Config field | Description |
| --- | --- |
| Name | Optional display-only label; it is not sent, emitted as metadata, or used as the connection identity. |
| Connection | `kvhostlink-connection` config node. |
| Source | Literal text, `msg`, `flow`, `global`, or `env`. |
| Static updates | JSON object when Source is `str`. |
| Metadata | `full`, `minimal`, or `off`. |
| Errors | `throw`, `msg.error`, or second output. |

| Input msg field | Description |
| --- | --- |
| `msg.updates` | Object or JSON string updates. |
| `msg.address` | Single address for one write. |
| `msg.dtype` | Required for a bare single-write address. Use exactly `BIT`, `U`, `S`, `D`, `L`, `F`, or `H`. Omit it when the address already contains a dtype or word-bit selector; specifying both is an error. `COMMENT` is read-only. |
| `msg.value` | Single write value. Required when `msg.address` is used. |
| `msg.topic` | `connect`, `disconnect`, or `reinitialize` for connection control. |
| `msg.connect` | Set to `true` to connect. |
| `msg.disconnect` | Set to `true` to disconnect. |
| `msg.reinitialize` | Set to `true` to close and reconnect. |

Runtime write fields are authoritative when present. `msg.updates` and
`msg.address` are mutually exclusive, and `msg.value`/`msg.dtype` are valid only
with `msg.address`. Invalid, empty, conflicting, or isolated runtime fields fail;
the node does not execute configured updates as a fallback.

Every update is validated before the first PLC request. Numeric values must be
finite JavaScript numbers in the selected format's exact range; strings,
Booleans, fractional integers, wraparound values, and Float32 overflow are
rejected. An empty update object performs no write and is rejected.

| Output msg field | Description |
| --- | --- |
| `msg.payload` | Original payload is passed through. |
| `msg.kvhostlink` | Metadata when enabled. |
| `msg.error` | Error object when Errors is `msg.error`. |

Success is always sent through output 1. `throw` reports failure through
`done(error)` without a message, `msg.error` sends the failed message on output
1, and `Second output` sends it only on output 2. The saved terminal count must
match the selected mode exactly; conflicting old flows are rejected for review.

## Address syntax

| Form | Example | Meaning |
| --- | --- | --- |
| Word value | `DM100:U` | Read or write an unsigned word value. |
| Signed 16-bit | `DM100:S` | Interpret one word as signed 16-bit. |
| Unsigned 32-bit | `DM120:D` | Interpret two words as unsigned 32-bit. |
| Signed 32-bit | `DM130:L` | Interpret two words as signed 32-bit. |
| Float32 | `DM130:F` | Interpret two words as a 32-bit float. |
| Hex word | `DM140:H` | Read or write a word as uppercase hexadecimal text. |
| Comment read | `DM145:COMMENT` | Read the device comment string. |
| Bit in word | `DM150.3` | Read or write bit 3 in `DM150`. |
| Word array | `DM160:U,4` | Read or write four consecutive unsigned word values. |
| Bit array | `R200:BIT,4` | Read or write four consecutive relay bits. |
| Timer preset | `T10:D` | Read timer preset value. |
| Counter preset | `C10:D` | Read counter preset value. |

Use `:` for data types and `.0` through `.F` for bit-in-word access.
`DM100.D` means bit `D` inside `DM100`; use `DM100:D` for a 32-bit value.
High-level read/write addresses must specify the data type explicitly, such as `:U`, `:D`, or `:BIT`.
The complete address-list input is parsed. Extra text before, between, or after
addresses is an error rather than being ignored.

## Timer and counter

`T10:D` and `C10:D` use the high-level timer/counter behavior.
Reads return the preset value for compatibility with ordinary scalar reads.
Timer/counter preset writes use Host Link `WS` and `WSS`, which are supported only on KV-8000/7000-series CPU units.
Other CPU units may return PLC error `E1`.

Use `TC`, `TS`, `CC`, and `CS` when you want the timer/counter current/contact device families directly.

## Connection control messages

Both read and write nodes accept connection control messages.

| Message | Action |
| --- | --- |
| `msg.topic = "connect"` | Connect the shared connection. |
| `msg.topic = "disconnect"` | Disconnect the shared connection. |
| `msg.topic = "reinitialize"` | Disconnect, then connect again. |
| `msg.connect = true` | Connect the shared connection. |
| `msg.disconnect = true` | Disconnect the shared connection. |
| `msg.reinitialize = true` | Disconnect, then connect again. |

## Operational recipes

The `examples/flows/kvhostlink-multi-plc-monitor.json` flow is a read-only multi-PLC monitor. It polls `DM100:U`, emits long-form rows shaped as `timestamp,plc,tag,value`, and uses `connected`, `lost`, `reconnecting`, and `recovered` state transitions with a 1 second to 30 second backoff.

For config-driven polling, keep a JSON config in an Inject or Function node and feed `msg.addresses` into `kvhostlink-read`; no extra node type is required.

To persist CSV-equivalent rows, route the long-form row messages through a CSV node with `timestamp`, `plc`, `tag`, and `value` columns, then into a File node in append mode.

## Metadata output

| Metadata mode | `msg.kvhostlink` fields |
| --- | --- |
| `full` | Adds current `operation`, `itemCount`, `metadataMode`, connection, and current read `addresses` or write `updates`. |
| `minimal` | Adds current `operation`, `itemCount`, and `metadataMode`; owned full-mode fields are removed. |
| `off` | Leaves `msg.kvhostlink` unchanged. |

With `off`, a pre-existing `msg.kvhostlink` value is not guaranteed to describe
the current operation or result.

The connection metadata contains `host`, `port`, `transport`, and `timeout`.

## Error handling

| Errors setting | Behavior |
| --- | --- |
| `Throw` | Calls Node-RED `done(error)`. |
| `msg.error` | Adds the error object to `msg.error` and sends the message on output 1. |
| `Second output` | Sends normal messages on output 1 and error messages on output 2. |

## Traffic statistics

Call `client.trafficStats()` to inspect completed framed sends and responses. Close/reconnect does not reset it.
For TCP, a received line counts its body plus the first CR/LF terminator; extra CR/LF separators
are consumed but not counted. For UDP, the complete response datagram is counted.
