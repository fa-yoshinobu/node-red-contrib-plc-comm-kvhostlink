# User Guide

## Start here

1. Install `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` into `~/.node-red`.
2. Restart Node-RED and create one `kvhostlink-connection` config node.
3. Import `kvhostlink-basic-read-write.json` first.
4. After scalar read/write works, import `kvhostlink-typed-read-write.json` and `kvhostlink-array-read-write.json`.
5. Use `kvhostlink-device-matrix.json` for one-by-one verification only after the first three flows are stable.

## Address forms

- `DM100`
- `DM110:S`
- `DM120:D`
- `DM130:L`
- `DM140:F`
- `DM145:COMMENT`
- `DM150.3`
- `DM160,4`
- `R200,4`
- `T10:D`
- `C10:D`

`T10:D` and `C10:D` read the preset value through the normal read node and
`readNamed` helper semantics. In custom JavaScript code, use the exported
`readTimerCounter(client, "T10")`, `readTimer(client, "T10")`, or
`readCounter(client, "C10")` helper when you need all three Host Link fields:
`status`, `current`, and `preset`.

## Connection settings

Configure these explicitly on the connection node:

- host
- port
- transport: `tcp` or `udp`
- timeout in milliseconds

Commands are sent with Host Link CR termination.

## Changes since Flow Library 0.2.0

The Node-RED Flow Library currently shows `0.2.0` as the published baseline for this scoped package.

- Host Link command framing is fixed to CR termination.
- The connection node now exposes an explicit timeout setting.
- Read/write nodes expose metadata modes, connection control messages, comment reads, and canonical address helper exports.
- The matrix flow now includes run-all read/write buttons, timeout tracking, an auto-run status lamp, non-overlapping buttons, and JSONL logging.
- The matrix write sequence skips entries marked `writable: false`; timer/counter `T` and `C` samples are circuit-dependent and not safe generic write targets.

## Device input validation

Read/write input validation checks address syntax, device code support, suffix forms, bit notation, count syntax, and Host Link command constraints.
It also rejects spans that cross the common Host Link device-family bounds before a request is sent, including 32-bit reads that would run past the end of a word device area.
It does not check PLC model-specific device ranges because the Node-RED connection profile does not select a PLC model.
If an address is valid for the common Host Link family but outside the connected PLC's actual range, the PLC response is returned as the runtime error.

`Tn:D` and `Cn:D` depend on a corresponding timer or counter circuit existing in the PLC program.
If the circuit is not present, a PLC error or timeout is an expected validation result rather than a device parser failure.
Use `TC` / `TS` / `CC` / `CS` when checking the timer/counter current/contact device families directly.
Use `readTimerCounter` when you want the single Host Link `T` / `C` composite
response instead of reading those separate device families.

## Runtime behavior

Metadata modes:

- `full`: emit configured addresses or updates plus the effective connection profile in `msg.kvhostlink`
- `minimal`: emit only `itemCount` and `metadataMode` in `msg.kvhostlink`
- `off`: leave `msg.kvhostlink` unchanged

Connection control:

- `msg.connect = true`
- `msg.disconnect = true`
- `msg.reinitialize = true`
- or `msg.topic = "connect" | "disconnect" | "reinitialize"`

The read and write nodes keep the caller-visible logical request shape and do not silently switch to a different fallback split behavior.

Comment reads such as `DM145:COMMENT` use the Host Link `RDC` command and return strings in `msg.payload`.

XYM aliases are also accepted for comment reads, so forms such as `D10:COMMENT`, `M20:COMMENT`, and `X100:COMMENT` are valid.

The helper exports also include `normalizeAddress()`, `formatParsedAddress()`,
`normalizeAddressList()`, `readTimerCounter()`, `readTimer()`, and
`readCounter()` when runtime code needs helper-layer behavior outside the
editor UI.

## Example flows

- [Example Flows](../../examples/flows/README.md)
- [kvhostlink-basic-read-write.json](../../examples/flows/kvhostlink-basic-read-write.json)
- [kvhostlink-typed-read-write.json](../../examples/flows/kvhostlink-typed-read-write.json)
- [kvhostlink-array-read-write.json](../../examples/flows/kvhostlink-array-read-write.json)
- [kvhostlink-device-matrix.json](../../examples/flows/kvhostlink-device-matrix.json)

The matrix flow writes completed results to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.
It includes one-by-one buttons, run-all read/write buttons, timeout tracking, and an auto-run status lamp.

Latest retained KV Host Link matrix result:

- date: `2026-05-02`
- target class: `KV-5000`
- catalog samples: `35`
- completed JSONL records: `157`
- result: all records `OK`

## Known limitations

- `AT` is still tracked as pending support.
- `kvhostlink-device-matrix.json` is intended for validation and debugging, not as the first flow for a new user.

## Runtime smoke test from the repository root

```bash
npm run smoke:editor
```

- The smoke script installs the local package into an isolated temporary userDir, starts a temporary Node-RED runtime, imports `kvhostlink-basic-read-write.json`, and verifies that the flow reaches `Started flows`.
