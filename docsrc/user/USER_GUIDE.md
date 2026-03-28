# User Guide

## Quick start

1. Install `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` into `~/.node-red`.
2. Restart Node-RED and add one `kvhostlink-connection` config node.
3. Start with `kvhostlink-read` and a safe address such as `DM100`, `DM110:S`, or `DM160,4`.
4. Use `kvhostlink-write` only after confirming the target PLC and test ranges.

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
- [kvhostlink-device-matrix.json](../../examples/flows/kvhostlink-device-matrix.json)

The matrix flow writes completed results to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Validated PLC model

- `KV-7500`

## Known limitations

- `AT` is still tracked as pending support.
- Timer and counter semantics are exposed through high-level scalar helpers, but the current sample set is still focused on matrix verification rather than workflow-specific examples.
