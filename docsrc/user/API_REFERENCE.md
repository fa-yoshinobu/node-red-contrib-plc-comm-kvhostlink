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

`setTime(date)` accepts a valid JavaScript `Date` whose local calendar year is
2000 through 2099. A full year is never folded into a two-digit wire year.

Semantic reads validate the exact response token count derived from the issued
command. Direct-bit responses accept only `0`, `1`, `OFF`, or `ON`; numeric reads of direct
bit devices require the corresponding 16- or 32-point response. A malformed
response shape invalidates the connection rather than being reused.

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
addresses; trailing or embedded garbage is rejected. `readNamed`, `writeNamed`,
and `poll` reject empty work. `writeNamed` validates the complete update object
before it sends the first request, so a later invalid update cannot cause a
partial write batch.

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
