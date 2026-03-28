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
- `DM150.3`
- `DM160,4`
- `R200,4`
- `T10:D`
- `C10:D`

## Example flows

- [Example Flows](../../examples/flows/README.md)
- [kvhostlink-basic-read-write.json](../../examples/flows/kvhostlink-basic-read-write.json)
- [kvhostlink-typed-read-write.json](../../examples/flows/kvhostlink-typed-read-write.json)
- [kvhostlink-array-read-write.json](../../examples/flows/kvhostlink-array-read-write.json)
- [kvhostlink-device-matrix.json](../../examples/flows/kvhostlink-device-matrix.json)

The matrix flow writes completed results to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Validated PLC model

- `KV-7500`

## Known limitations

- `AT` is still tracked as pending support.
- `kvhostlink-device-matrix.json` is intended for validation and debugging, not as the first flow for a new user.

## Runtime smoke test

- A local Node-RED runtime smoke test loaded kvhostlink-basic-read-write.json from an isolated userDir and reached Started flows.

