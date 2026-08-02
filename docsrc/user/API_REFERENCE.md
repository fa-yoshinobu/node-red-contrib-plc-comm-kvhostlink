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
| Other | `readComments`, `readCommentBytes`, `switchBank`, `readExpansionUnitBuffer`, `writeExpansionUnitBuffer` |

Every framed request is at most 65,536 bytes including its terminator. The exact
limit is accepted; a one-byte-larger request fails before traffic counters or
transport state change.

TCP reuses its connected stream. UDP also reuses a successfully connected
physical socket, resolved IPv4 address, and local endpoint. Timeout,
cancellation, socket/protocol failure, malformed or additional response data,
or a datagram with no owning request retires that UDP socket. A later request
creates one replacement from the saved IPv4 address without retrying the failed
operation or repeating DNS resolution. Residual duplicate-datagram ambiguity
after a subsequent request has already taken ownership remains inherent to UDP.

Low-level numeric operations take a base device plus `.U`, `.S`, `.D`, `.L`, or
`.H`. Suffix-bearing low-level devices are rejected. Bare direct-bit operations
use bit semantics. Numeric writes accept only exact finite JavaScript numbers in
range. Direct-bit writes accept only JavaScript `true` or `false`; numbers and
strings such as `1`, `0`, `ON`, and `OFF` are invalid write values. Response
decoding may still recognize the documented PLC bit tokens.

The former public `writeBitInWord` read-modify-write helper is removed. It could
not provide an atomic PLC update. Read a word and write a word explicitly only
when the application owns the required concurrency and partial-failure policy.

`readComments(device, encoding[, options])` requires exact `encoding` `utf8` or
`cp932`. `cp932` uses the Windows-31J-compatible mapping commonly described by
KEYENCE as Shift_JIS; there is no separate strict Shift_JIS selection or alias.
Malformed bytes raise `HostLinkProtocolError` without replacement or fallback.
`readCommentBytes(device[, options])` returns the exact RDC body `Buffer`
without CR/LF and preserves trailing padding. Raw and comment-byte results are
independent caller-owned Buffers; mutating one does not alter transport state or
another result. At protocol level,
`decodeCommentResponse(raw, encoding)` and `decodeCommentBytes(raw)` provide the
same text/raw split. Text decoding does not strip a leading Unicode BOM from
the payload; UTF-8 `EF BB BF` decodes as `U+FEFF`. CP932 bytes `00` through
`7F` map to the identical ASCII code points, while `80`, `A0`, and `FD` through
`FF` are invalid; half-width and double-byte code units decode strictly.

## High-level helpers

| Area | Public API |
| --- | --- |
| Address syntax | `parseAddress`, `formatParsedAddress`, `normalizeAddress`, `normalizeAddressList` |
| Device syntax | `parseDevice`, `deviceToString`, `parseDeviceText`, `normalizeSuffix` |
| Typed access | `readTyped`, `writeTyped`, `readWords`, `readDWords` |
| Timer/counter | `readTimerCounter`, `readTimer`, `readCounter` |
| Named access | `readNamed`, `writeNamed`, `poll` |
| Comments | `readComments`, `readCommentBytes` |

Float32 `F` uses the canonical device metadata and is available only when the
device family's normal Host Link shape is one `.U` word with ordinary
consecutive two-word access. `DM0:F` remains valid. `R0:F`, `T0:F`, `C0:F`,
and `AT0:F` fail in parsing, normalization, formatting, typed access, named
access, and polling before FIFO admission or transport. A hand-constructed
formatter object cannot bypass this check.

`readNamed` validates and snapshots the whole input before FIFO admission and
occupies one FIFO turn. Compatible device groups execute in the order each group
first appears in the input. Within a group, addresses are sorted ascending,
contiguous ranges are merged, and protocol limits are split at the minimum valid
boundaries. Public result mapping still follows input order. A scalar, dword,
float, array, or other declared entry is never torn between requests. The call
stops at the first failure and returns no partial result. Multiple requests are
not a coherent PLC snapshot because the PLC may change between them. Use one
protocol request or a PLC-side consistency handshake when coherence matters.

Named keys must be semantically unique after parsing device family, numeric
address, dtype, bit index, and count. Case, leading zeros, and an explicit
`,1` do not make a second key; different dtypes, bit indexes, or merely
overlapping spans remain valid. Successful results retain each original input
spelling. `normalizeAddressList` validates delimited strings, JavaScript arrays,
and JSON arrays identically while returning each valid trimmed spelling.

`poll` requires an integer interval from `1` through `2147483647` milliseconds.
Zero is not a maximum-speed mode, and larger values are outside the native
Node.js timer range. It compiles the immutable named-read plan once at polling
start, uses one aggregate FIFO turn per cycle, then waits the interval outside
that turn. It does not publish a partial cycle.

When a `readNamed`/`poll` plan contains `:COMMENT`, its options must contain
`commentOutput: "text"` plus `commentEncoding: "utf8" | "cp932"`, or
`commentOutput: "buffer"` with no encoding. Missing/contradictory comment
options reject the complete plan before FIFO admission or send. Comment options
on a plan without `:COMMENT` are also rejected instead of being ignored.

`writeNamed` validates and snapshots the complete update set. It is accepted only
when the plan is one wire request. Any state-changing plan that would require two
or more requests, including a bit-in-word read-modify-write, fails before
connection or transport. The library never auto-splits or retries writes.

Direct `BIT` entries for the decimal sixteen-bit bank families `R`, `MR`, `LR`,
and `CR` are consecutive by logical bit number. Thus `R115:BIT` followed in
insertion order by `R200:BIT` produces one `writeConsecutive` request whose
displayed start remains `R115`. Within-bank behavior is unchanged. Gaps,
duplicates, reverse order, mixed families, mixed dtypes, invalid display-bit
positions, and more than 1000 bit values reject the complete update before
transport; the planner never sorts or deduplicates entries.

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
`ValueError`, `availablePlcProfiles`, `buildFrame`, `decodeCommentBytes`, `decodeCommentResponse`,
`decodeResponse`, `deviceToString`, `displayName`, `ensureSuccess`,
`formatParsedAddress`, `normalizeAddress`, `normalizeAddressList`,
`normalizePlcProfile`, `normalizeSuffix`, `openAndConnect`, `parseAddress`,
`parseDataTokens`, `parseDevice`, `parseDeviceText`, `parseScalarToken`, `poll`,
`profileDescriptors`, `profileFromName`, `readCommentBytes`, `readComments`, `readCounter`,
`readDWords`, `readNamed`, `readTimer`, `readTimerCounter`, `readTyped`,
`readWords`, `splitDataTokens`, `writeNamed`, `writeTyped`.

## Traffic statistics

`trafficStats()` returns a frozen lifetime `{ requestCount, txBytes, rxBytes }`
snapshot. TCP receive bytes include the body and first terminator; UDP counts the
accepted datagram. Close/reconnect does not reset the counters.
