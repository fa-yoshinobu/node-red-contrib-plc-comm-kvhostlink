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
| Raw command exchange | `sendRaw`, `sendRawDecoded` |
| PLC mode and error control | `changeMode`, `clearError`, `checkErrorNo`, `confirmOperatingMode` |
| PLC model and clock | `queryModel`, `setTime`, `MODEL_CODES` |
| Connection lifecycle | `connect`, `close` |

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

## High-Level Helpers

| Operation | Public API |
| --- | --- |
| Address parsing and formatting | `parseAddress`, `formatParsedAddress`, `normalizeAddress`, `normalizeAddressList` |
| Device parsing and formatting | `parseDevice`, `deviceToString`, `parseDeviceText`, `normalizeSuffix`, `resolveEffectiveFormat` |
| Typed values | `readTyped`, `writeTyped` |
| Timer/counter composite reads | `readTimerCounter`, `readTimer`, `readCounter` |
| Named snapshots and polling | `readNamed`, `writeNamed`, `poll` |
| Word/dword reads | `readWords`, `readDWords` |
| Bit-in-word write | `writeBitInWord` |

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
`readTimerCounter`, `readTyped`, `readWords`, `resolveEffectiveFormat`,
`splitDataTokens`, `writeBitInWord`, `writeNamed`, `writeTyped`.
