# Example Flows

## Start Here

- `kvhostlink-device-matrix.json`
  High-level one-by-one debug flow for KEYENCE KV Host Link device families.
  It records completed results to `logs/kvhostlink-device-matrix-<session>.jsonl` under your Node-RED user directory.

## Notes

- Edit the catalog in `Prepare next device sample (edit catalog here)` before deploy if your PLC uses different ranges.
- The flow uses only the high-level `kvhostlink-read` and `kvhostlink-write` nodes.
- Use `Reset sequence + history` before a new verification pass.
