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
| Host | Yes | Empty | IPv4 PLC address, or a host name that resolves to IPv4. IPv6 is unsupported. |
| Port | Yes | `8501` | TCP or UDP port. |
| Transport | Yes | `tcp` | `tcp` or `udp`. |
| Timeout ms | Yes | `3000` | One absolute active connection/request deadline in milliseconds. |
| PLC Profile | Yes | `keyence:kv-x500` | Canonical lowercase profile value. |

Accepted profile values are listed in [PLC profiles](PROFILES.md).
The values shown in a newly created editor node are initial form values. A
saved flow must retain explicit port and transport fields; the runtime does not
repair missing values.
Port and timeout must be decimal integer text within their documented range.
The connection node converts that form text once at the Node-RED boundary;
direct `HostLinkClient` construction requires actual safe JavaScript integers
and never coerces numeric strings.
The profile must equal one canonical lowercase identifier exactly; aliases,
case changes, surrounding whitespace, and object/string coercion are rejected.
IPv6 literals and host names without an IPv4 result are rejected. When a host
name has several IPv4 results, the first resolver result is used.

## Performance notes

For stable local networks, UDP usually has the lowest latency. TCP is the safer
default for remote or less predictable networks because the OS handles
retransmission.

Reuse one `kvhostlink-connection` config node for repeated reads and writes.
Prefer reading one address list or one array address over many separate
single-address messages when one application result set can be read together.

## Connection reuse and concurrent requests

Share one `kvhostlink-connection` config node between read and write nodes that
talk to the same PLC endpoint. The ordinary client places concurrent calls in a
strict FIFO, snapshots all effective inputs at admission, and holds a compound
read for one complete queue turn. Different connection clients progress
independently. A waiting call does not start its timeout until it becomes active.

Use the connection control messages `connect`, `disconnect`, and `reinitialize`
for deliberate connection control. Create separate connection config nodes only
when you intentionally want separate PLC sessions.

Once active, one monotonic timeout covers sending, response framing/receive, and
decoding. Partial writes, trickled response bytes, and phase changes do not
restart it. Most JavaScript client/helper calls accept a final `{ signal }`
option. Canceling a waiting call removes it without sending; canceling active
I/O retires that connection generation. `close()` rejects active and waiting
work immediately, and callers must explicitly reconnect and submit new work.

Each TCP request exclusively owns one non-empty response line. Stale partial
data, an unsolicited line, or an additional line invalidates that socket rather
than becoming a later request's response. UDP work is bound to the socket
generation on which it was queued. Close rejects active and queued work from
that generation; it is never resent on a replacement socket. Malformed decoder
output and mode responses other than exact `0` or `1` also invalidate the
supplying generation. PLC command errors `E0` through `E9` remain reusable.

## kvhostlink-read node

| Config field | Description |
| --- | --- |
| Name | Optional display-only label; it is not sent, emitted as metadata, or used as the connection identity. |
| Connection | `kvhostlink-connection` config node. |
| Source | Literal text, `msg`, `flow`, `global`, or `env`. |
| Addresses | Literal address list when Source is `str`. |
| Output | `object` always returns an address-keyed object, `array` always returns an array, and `value` requires exactly one address. |
| RDC comment | Required when the resolved plan contains `:COMMENT`: select decoded `text` or raw `buffer`. |
| Encoding | Required only for text comments: exact `utf8` or `cp932`. |
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

A multi-entry read is prevalidated and runs in declared input order; the
library never sorts addresses into a different wire order. Read-only work may
be combined or split at protocol limits, but only between complete input
entries. A scalar, dword, float, array, or other declared entry is never torn
between requests. The operation stops on first failure and returns no partial
object. Multiple requests are not an atomic/coherent PLC snapshot because the
PLC may change between them. Use one protocol request or a PLC-side sequence/
handshake when values must describe one instant.

### RDC comment bytes and text

Every RDC response is first an exact byte body without CR/LF. Raw `buffer`
output returns those bytes unchanged, including trailing ASCII padding spaces.
Text output requires the exact saved encoding `utf8` or `cp932`; `cp932` is the
Windows-31J-compatible mapping commonly described by KEYENCE as Shift_JIS.
There is no separate strict Shift_JIS selection and aliases such as `utf-8`,
`shift_jis`, `windows-31j`, or `auto` are invalid public settings.

The node preflights the complete resolved address plan. Missing text encoding,
an encoding combined with raw Buffer output, or any unsupported value fails
before connection or send. Decoding is fatal: malformed bytes raise a protocol
error, invalidate the connection generation that supplied them, and never fall
back to another codec or insert replacement characters. Ambiguous bytes are
decoded only by the selected codec.
A leading UTF-8 BOM is payload data and decodes to `U+FEFF`; it is not silently
removed. The same bytes selected as `cp932` are decoded only as CP932 and fail
when they are not a valid CP932 sequence.
For `cp932`, bytes `00` through `7F` retain the identical ASCII code points;
`80`, `A0`, and `FD` through `FF` are invalid. Half-width and double-byte code
units are decoded strictly, including Windows-31J extension characters.

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
rejected. Float32 is valid only for word device families; every direct-bit
family rejects it before any read or write. Direct-bit write values must be
actual JavaScript Booleans; numeric/string `0`, `1`, `ON`, and `OFF` are not
coerced. An empty update object performs no write and is rejected.

A complete `writeNamed` update set is snapshotted, compiled, and checked before
connecting. It is accepted only when it can be sent as one wire request within
the applicable limit: 1000 word points, 500 dword/Float32 points, or 120
timer/counter points. A plan requiring multiple requests fails as a whole before
transport. State-changing operations are never auto-split or auto-retried.
Bit-in-word writing is unsupported because a client-side read-modify-write is
not atomic against PLC logic or another connection.

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
| Comment read | `DM145:COMMENT` | Read explicit-codec text or the exact raw RDC body Buffer. |
| Bit in word | `DM150.3` | Read bit 3 in `DM150`; bit-in-word writing is unsupported. |
| Word array | `DM160:U,4` | Read or write four consecutive unsigned word values. |
| Bit array | `R200:BIT,4` | Read or write four consecutive relay bits. |
| Timer preset | `T10:D` | Read timer preset value. |
| Counter preset | `C10:D` | Read counter preset value. |

Use `:` for data types and `.0` through `.F` for bit-in-word access.
`DM100.D` means bit `D` inside `DM100`; use `DM100:D` for a 32-bit value.
High-level read/write addresses must specify the data type explicitly, such as `:U`, `:D`, or `:BIT`.
Each address contains exactly one complete selector: one dtype, or one word-bit
selector, followed by an optional positive safe-integer count only where that
form supports a count. `BIT` is limited to direct-bit device families,
Float32 `F` is limited to word device families, and `COMMENT` is limited to
devices supported by `RDC`. Comment and word-bit forms do not accept a count.
The editor and runtime use this same grammar. Extra selectors or text before,
between, or after addresses is an error rather than being ignored.

## Timer and counter

`T10:D` and `C10:D` use the high-level timer/counter behavior.
Reads return the preset value for compatibility with ordinary scalar reads.
Timer/counter preset writes use Host Link `WS` and `WSS`, which are supported only on KV-8000/7000-series CPU units.
Other CPU units may return PLC error `E1`.

Use `TC`, `TS`, `CC`, and `CS` when you want the timer/counter current/contact device families directly.

## Node status and diagnosis

Node status is a concise progress indicator. Use the selected error route and
its Error object for diagnosis; do not parse status text as an error code.

| Node / state | Fill | Shape | Exact text |
| --- | --- | --- | --- |
| Connection created | grey | ring | `ready` |
| Connection opening | yellow | ring | `connecting` |
| Connection open | green | dot | `connected` |
| Connection closing | yellow | ring | `disconnecting` |
| Connection closed by a disconnect operation | red | ring | `disconnected` |
| Connection closing and opening again | yellow | ring | `reinitializing` |
| Config node removed or runtime stopped | grey | ring | `closed` |
| Read in progress | blue | dot | `reading` |
| Write in progress | blue | dot | `writing` |
| Successful read or write | green | dot | `N item(s)` |
| Failed read, write, or control action | red | ring | The actual `error.message` |

A `connect`, `disconnect`, or `reinitialize` control message first shows a
yellow ring with that exact action name. Success then shows a dot with the same
text: green for `connect` and `reinitialize`, red for `disconnect`.

The failure status is deliberately dynamic. Timeout and
operation-outcome-unknown failures are error classifications, not promised
status strings. Depending on the configured Errors mode, inspect the Error
passed to `done(error)` or the Error in `msg.error` on output 1 or output 2.
Its JavaScript type and structured fields such as `code`, `reason`, and
`cause` provide the available diagnosis.

PLC profile selection and unsupported local input are validated before
transport; such a failure does not prove that a PLC rejected a request. If a
state-changing request may have been sent and its outcome is unknown, the node
does not retry it automatically. Confirm PLC/application state with an
appropriate read or operator procedure before deciding whether to issue
another write.


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

The basic, typed, and array write buttons are manual controlled-test paths.
Each saves the original value or snapshot, generates format-valid random test
values, writes once, restores the saved state, and reads again. Restoration is
best effort after communication failure. The device-matrix flow is read-only;
its write controls and write router are deliberately disabled.

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

JavaScript callers can classify failures by exported type/code:

| Error | Caller meaning |
| --- | --- |
| `ValueError` | Local input/configuration error; no send. |
| `HostLinkNotConnectedError` | Call `connect()` explicitly. |
| `HostLinkCanceledError` | Caller cancellation. |
| `HostLinkTimeoutError` | The absolute active deadline expired. |
| `HostLinkClosedError` | Explicit close rejected the operation. |
| `HostLinkConnectionError` | DNS/socket/transport failure. |
| `HostLinkProtocolError` | Invalid framing, bytes, tokens, or response shape. |
| `HostLinkError` | Complete PLC `E0` through `E9`; inspect `code`. |
| `HostLinkOperationOutcomeUnknownError` | A state change may have reached the PLC; inspect `reason` and `cause`. |

An application may reconnect and retry a read according to its own policy. Do
not automatically retry an outcome-unknown write: reconcile PLC/application
state first, because repeating it can duplicate a state change.

## Traffic statistics

Call `client.trafficStats()` to inspect completed framed sends and responses. Close/reconnect does not reset it.
For TCP, a received line counts its body plus the first CR/LF terminator; extra CR/LF separators
are consumed but not counted. For UDP, the complete response datagram is counted.
