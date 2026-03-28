# Example Flows

## Start here

- `kvhostlink-basic-read-write.json`
  First-step scalar read/write flow.
- `kvhostlink-typed-read-write.json`
  Signed, dword, long, float, and bit-in-word examples.
- `kvhostlink-array-read-write.json`
  `,count` examples for words and bits.
- `kvhostlink-device-matrix.json`
  High-level one-by-one debug flow for KEYENCE KV Host Link device families.
  It records completed results to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Notes

- Edit the catalog in `Prepare next device sample (edit catalog here)` before deploy if your PLC uses different ranges.
- The flows use only the high-level `kvhostlink-read` and `kvhostlink-write` nodes.
- Use `Reset sequence + history` before a new matrix verification pass.
