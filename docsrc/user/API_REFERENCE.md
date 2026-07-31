# KV Host Link Node-RED API Reference

The public JavaScript entry point is `lib/hostlink`. `HostLinkClient` is the
ordinary low-level client; there is no separate queued-client wrapper.

## Connection contract

`new HostLinkClient({ host, port, transport, timeout, plcProfile })` performs no
network I/O. `host` is an IPv4 literal or a hostname with an IPv4 DNS result;
IPv6 literals and IPv6-only names are unsupported. `port` and `timeout` are
safe integers, `transport` is `tcp` or `udp`, and `plcProfile` must be one exact
canonical value from `PLC_PROFILES`. Endpoint, timeout, transport, and profile
are immutable snapshots for the lifetime of the client.

Call `connect()` before commands and again after `close()`, timeout, cancellation
of active I/O, protocol/framing failure, or transport failure. Commands do not
reconnect or retry. `openAndConnect(options[, { signal }])` is the convenience
constructor. `close()` immediately rejects active and waiting work and prevents
that work from appearing on a later connection.

The ordinary client admits concurrent calls into one strict FIFO per client.
Arguments are validated and copied at admission. A waiting call's timeout begins
only when it becomes active. Most asynchronous operations accept a final
`{ signal }` option with an `AbortSignal`; canceling a waiting operation removes
only that operation without a send. Different client instances are independent.

Once a request becomes active, one monotonic deadline covers the complete send,
response framing/receive, and decode. Progress or partial bytes do not restart
that deadline. One TCP request owns exactly one non-empty response line.

## Client operations

| Area | Operations |
| --- | --- |
| Lifecycle | `connect`, `close`, `trafficStats` |
| Raw/control | `sendRaw`, `changeMode`, `clearError`, `checkErrorNo`, `confirmOperatingMode`, `queryModel`, `setTime` |
| Device access | `read`, `readConsecutive`, `write`, `writeConsecutive` |
| Force/set values | `forcedSet`, `forcedReset`, `forcedSetConsecutive`, `forcedResetConsecutive`, `writeSetValue`, `writeSetValueConsecutive` |
| Monitor | `registerMonitorBits`, `registerMonitorWords`, `readMonitorBits`, `readMonitorWords` |
| Other | `readComments`, `switchBank`, `readExpansionUnitBuffer`, `writeExpansionUnitBuffer` |

Every framed request is at most 65,536 bytes including its terminator. The exact
limit is accepted; a one-byte-larger request fails before traffic counters or
transport state change.

Low-level numeric operations take a base device plus `.U`, `.S`, `.D`, `.L`, or
`.H`. Suffix-bearing low-level devices are rejected. Bare direct-bit operations
use bit semantics. Numeric writes accept only exact finite JavaScript numbers in
range. Direct-bit writes accept only JavaScript `true` or `false`; numbers and
strings such as `1`, `0`, `ON`, and `OFF` are invalid write values. Response
decoding may still recognize the documented PLC bit tokens.

The former public `writeBitInWord` read-modify-write helper is removed. It could
not provide an atomic PLC update. Read a word and write a word explicitly only
when the application owns the required concurrency and partial-failure policy.

## High-level helpers

| Area | Public API |
| --- | --- |
| Address syntax | `parseAddress`, `formatParsedAddress`, `normalizeAddress`, `normalizeAddressList` |
| Device syntax | `parseDevice`, `deviceToString`, `parseDeviceText`, `normalizeSuffix` |
| Typed access | `readTyped`, `writeTyped`, `readWords`, `readDWords` |
| Timer/counter | `readTimerCounter`, `readTimer`, `readCounter` |
| Named access | `readNamed`, `writeNamed`, `poll` |
| Comments | `readComments` |

`readNamed` validates and snapshots the whole input before transport, preserves
declared input order as wire order, and occupies one FIFO turn. It may combine or
split read-only requests only between declared input entries; it never tears a
scalar, dword, float, array, or other declared entry. It stops at the first
failure and returns no partial result. Multiple requests are not a coherent PLC
snapshot because the PLC may change between them. Use one protocol request or a
PLC-side consistency handshake when coherence matters.

`writeNamed` validates and snapshots the complete update set. It is accepted only
when the plan is one wire request. Any state-changing plan that would require two
or more requests, including a bit-in-word read-modify-write, fails before
connection or transport. The library never auto-splits or retries writes.

## Error contract

| Error | Meaning |
| --- | --- |
| `ValueError` | Invalid local value/configuration; no request is sent. |
| `HostLinkNotConnectedError` | Explicit `connect()` is required. |
| `HostLinkCanceledError` | Caller cancellation; active I/O retires that connection generation. |
| `HostLinkTimeoutError` | The absolute connection/transaction deadline expired. |
| `HostLinkClosedError` | Explicit close rejected active or waiting work. |
| `HostLinkConnectionError` | DNS, socket, or transport failure. |
| `HostLinkProtocolError` | Invalid framing, decoding, or semantic response shape. |
| `HostLinkError` | A complete PLC `E0` through `E9` response; `code` is the PLC code. |
| `HostLinkOperationOutcomeUnknownError` | A state-changing request may have reached the PLC. Inspect `reason` and `cause`. |

Read-only calls can be retried by application policy after an explicit reconnect.
Do not automatically retry `HostLinkOperationOutcomeUnknownError`: first
reconcile PLC/application state because repeating a change can duplicate it.

## Public symbol index

`CR`, `HostLinkBaseError`, `HostLinkCanceledError`, `HostLinkClient`,
`HostLinkClosedError`, `HostLinkConnectionError`, `HostLinkError`,
`HostLinkNotConnectedError`, `HostLinkOperationOutcomeUnknownError`,
`HostLinkProtocolError`, `HostLinkTimeoutError`, `MODEL_CODES`, `PLC_PROFILES`,
`ValueError`, `availablePlcProfiles`, `buildFrame`, `decodeCommentResponse`,
`decodeResponse`, `deviceToString`, `displayName`, `ensureSuccess`,
`formatParsedAddress`, `normalizeAddress`, `normalizeAddressList`,
`normalizePlcProfile`, `normalizeSuffix`, `openAndConnect`, `parseAddress`,
`parseDataTokens`, `parseDevice`, `parseDeviceText`, `parseScalarToken`, `poll`,
`profileDescriptors`, `profileFromName`, `readComments`, `readCounter`,
`readDWords`, `readNamed`, `readTimer`, `readTimerCounter`, `readTyped`,
`readWords`, `splitDataTokens`, `writeNamed`, `writeTyped`.

## Traffic statistics

`trafficStats()` returns a frozen lifetime `{ requestCount, txBytes, rxBytes }`
snapshot. TCP receive bytes include the body and first terminator; UDP counts the
accepted datagram. Close/reconnect does not reset the counters.
