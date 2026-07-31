# KV Host Link Node-RED API Reference

This page is a user-facing index of the JavaScript KV Host Link client surface
used by the Node-RED nodes. Use the usage guide for flow examples, and this
page when you need to find the low-level operation name for a specific Host
Link workflow.

The main low-level client type is `HostLinkClient` from
`lib/hostlink/client.js`.

## Connection And PLC Control

| Operation | Public API |
| --- | --- |
| Open a ready-to-use connection | `openAndConnect` |
| Low-level client | `HostLinkClient`, `constructor` |
| PLC mode and error control | `changeMode`, `clearError`, `checkErrorNo`, `confirmOperatingMode` |
| PLC model and clock | `queryModel`, `setTime`, `MODEL_CODES` |
| Connection lifecycle | `connect`, `close` |

Constructing `HostLinkClient` does not open a socket. Call `connect()` before
every first command and again after `close()`, timeout, or transport failure.
Commands never reconnect themselves. `openAndConnect` is the explicitly named
convenience path that returns a connected client.

Direct construction requires `port` and `timeout` to be actual safe JavaScript
integers in range; numeric strings, Booleans, fractions, NaN, infinities, and
unsafe integers are not converted. Node-RED form text is validated and converted
once by the connection node before client construction.

`setTime(date)` accepts a valid JavaScript `Date` whose local calendar year is
2000 through 2099. A full year is never folded into a two-digit wire year.

Semantic reads validate the exact response token count derived from the issued
command. Direct-bit responses accept only `0`, `1`, `OFF`, or `ON`; numeric reads of direct
bit devices require the corresponding 16- or 32-point response. A malformed
response shape invalidates the connection rather than being reused.
`confirmOperatingMode()` accepts only the exact complete response `0` or `1`.
Decoder-originated malformed responses invalidate the exact socket generation
that supplied them, while PLC `E0` through `E9` errors do not by themselves
discard a reusable connection. TCP assigns one response line to one request;
UDP close/cancellation never replays old queued work on a replacement socket.

## Device Operations

| Operation | Public API |
| --- | --- |
| Single device read/write | `read`, `write` |
| Consecutive device read/write | `readConsecutive`, `writeConsecutive` |
| Forced bit/device control | `forcedSet`, `forcedReset`, `forcedSetConsecutive`, `forcedResetConsecutive` |
| Timer/counter set-value writes | `writeSetValue`, `writeSetValueConsecutive` |
| Monitor registration/cycle | `registerMonitorBits`, `registerMonitorWords`, `readMonitorBits`, `readMonitorWords` |
| Comment reads | `readComments` |
| Data bank switching | `switchBank` |
| Expansion unit buffer access | `readExpansionUnitBuffer`, `writeExpansionUnitBuffer` |

Low-level numeric operations take a base device and a separate data format. For
example, use `read("DM100", ".D")`, not `read("DM100.D")`. The format is
required for numeric devices and expansion-unit buffer access. Bare direct-bit
devices do not require a numeric format. Numeric writes are range checked and
are not truncated, wrapped, or converted from strings. `F` writes require an
actual finite JavaScript number that is also representable as finite Float32.
Integer-only arguments such as bank, expansion unit, buffer address/count, and
bit index require safe JavaScript integers before their existing range checks.

`writeBitInWord` serializes its read and write as one client-side critical
section. This protects concurrent updates made through the same client; it does
not make the operation atomic against another connection or PLC program logic.

## High-Level Helpers

| Operation | Public API |
| --- | --- |
| Address parsing and formatting | `parseAddress`, `formatParsedAddress`, `normalizeAddress`, `normalizeAddressList` |
| Device parsing and formatting | `parseDevice`, `deviceToString`, `parseDeviceText`, `normalizeSuffix` |
| Typed values | `readTyped`, `writeTyped` |
| Timer/counter composite reads | `readTimerCounter`, `readTimer`, `readCounter` |
| Named snapshots and polling | `readNamed`, `writeNamed`, `poll` |
| Word/dword reads | `readWords`, `readDWords` |
| Bit-in-word write | `writeBitInWord` |

Address-list text must consist entirely of valid comma/whitespace-separated
addresses, and each address must match one complete selector grammar. Extra
selectors or trailing/embedded garbage, incompatible `BIT`/`F`/`COMMENT`
selectors, invalid count placement, and non-safe counts are rejected.
`readNamed`, `writeNamed`, and `poll` reject empty work. Float32 writes on every
direct-bit family fail before transport. `writeNamed` validates the complete
update object and compiled plan before it sends the first request, so a later
invalid update or an oversized group cannot cause a partial write batch. The
limits are 1000 word points, 500 dword/Float32 points, and 120 timer/counter
points; oversized calls are not split automatically.
`poll` requires `intervalMs` to be a non-negative safe JavaScript integer; it
does not coerce numeric strings, fractions, NaN, or infinities.

## Protocol, Profile, And Diagnostics

| Operation | Public API |
| --- | --- |
| Frame helpers | `buildFrame`, `decodeResponse`, `decodeCommentResponse`, `ensureSuccess` |
| Response token helpers | `splitDataTokens`, `parseScalarToken`, `parseDataTokens` |
| Profile lookup | `PLC_PROFILES`, `availablePlcProfiles`, `profileDescriptors`, `normalizePlcProfile`, `profileFromName`, `displayName` |
| Errors | `ValueError`, `HostLinkBaseError`, `HostLinkError`, `HostLinkProtocolError`, `HostLinkConnectionError` |

## Public Symbol Index

The low-level library module exports these public names:

`CR`, `HostLinkBaseError`, `HostLinkClient`, `HostLinkConnectionError`,
`HostLinkError`, `HostLinkProtocolError`, `MODEL_CODES`, `PLC_PROFILES`,
`availablePlcProfiles`,
`ValueError`, `buildFrame`, `decodeCommentResponse`, `decodeResponse`,
`deviceToString`, `displayName`, `ensureSuccess`, `formatParsedAddress`,
`normalizeAddress`, `normalizeAddressList`, `normalizePlcProfile`, `profileDescriptors`, `profileFromName`,
`normalizeSuffix`, `openAndConnect`, `parseAddress`, `parseDataTokens`,
`parseDevice`, `parseDeviceText`, `parseScalarToken`, `poll`,
`readComments`, `readCounter`, `readDWords`, `readNamed`, `readTimer`,
`readTimerCounter`, `readTyped`, `readWords`,
`splitDataTokens`, `writeBitInWord`, `writeNamed`, `writeTyped`.

## Traffic statistics

`HostLinkClient.trafficStats()` returns a frozen `{ requestCount, txBytes, rxBytes }` lifetime snapshot.
TCP receive bytes count the body plus the first CR/LF terminator, independent of separator
segmentation; UDP receive bytes count the complete datagram.
