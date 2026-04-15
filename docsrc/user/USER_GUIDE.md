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

## Connection settings

Configure these explicitly on the connection node:

- host
- port
- transport: `tcp` or `udp`
- timeout in milliseconds
- `Append LF on send`

Validated PLC model:

- `KV-7500`

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

The helper exports also include `normalizeAddress()`, `formatParsedAddress()`, and `normalizeAddressList()` when runtime code wants canonical uppercase address text outside the editor UI.

## Example flows

- [Example Flows](../../examples/flows/README.md)
- [kvhostlink-basic-read-write.json](../../examples/flows/kvhostlink-basic-read-write.json)
- [kvhostlink-typed-read-write.json](../../examples/flows/kvhostlink-typed-read-write.json)
- [kvhostlink-array-read-write.json](../../examples/flows/kvhostlink-array-read-write.json)
- [kvhostlink-device-matrix.json](../../examples/flows/kvhostlink-device-matrix.json)

The matrix flow writes completed results to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Known limitations

- `AT` is still tracked as pending support.
- `kvhostlink-device-matrix.json` is intended for validation and debugging, not as the first flow for a new user.

## Runtime smoke test from the repository root

```bash
npm run smoke:editor
```

- The smoke script installs the local package into an isolated temporary userDir, starts a temporary Node-RED runtime, imports `kvhostlink-basic-read-write.json`, and verifies that the flow reaches `Started flows`.
- A local Node-RED runtime smoke test loaded `kvhostlink-basic-read-write.json` from an isolated userDir and reached `Started flows`.
