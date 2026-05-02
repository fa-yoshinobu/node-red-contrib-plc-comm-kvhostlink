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

## Local smoke test from the repository root

```bash
npm run smoke:editor
```

This imports `kvhostlink-basic-read-write.json` into an isolated temporary userDir and verifies that the temporary Node-RED runtime reaches `Started flows`.

## Notes

- Edit the catalog in `Prepare next device sample (edit catalog here)` before deploy if your PLC uses different test addresses.
- The flows use only the high-level `kvhostlink-read` and `kvhostlink-write` nodes.
- The flow nodes keep the caller-visible logical request shape and do not silently switch to a different fallback split behavior.
- The beginner flows already show the metadata selector and the shared connection control pattern.
- Use `Reset sequence + history` before a new matrix verification pass.
- Use `Run all reads` or `Run all writes` to run the catalog automatically with one outstanding request at a time. The `Auto run status lamp` node shows active, pending, idle, and error state in the Node-RED editor.
- `T` and `C` high-level samples require a corresponding timer/counter circuit in the PLC program. A PLC error or timeout is expected when that circuit is absent; use `TC` / `TS` / `CC` / `CS` samples for read-only current/contact family checks.
- The write sequence skips entries marked `writable: false`, including the timer/counter samples that are not safe generic write targets.
- Latest retained KV-5000 matrix pass on 2026-05-02 completed 157 JSONL result records across 35 catalog samples with all records `OK`.
