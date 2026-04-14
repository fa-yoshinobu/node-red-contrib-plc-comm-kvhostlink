# Changelog

## Unreleased

## 0.2.2 - 2026-04-14

- add a committed `package-lock.json` so installs and release packaging use reproducible npm dependency resolution

## 0.2.1 - 2026-04-01

- add an optional `npm run smoke:editor` script that installs the local package into an isolated userDir, starts a temporary Node-RED runtime, imports `kvhostlink-basic-read-write.json`, and verifies the flow starts cleanly
- refresh README, user guide, and example-flow docs with the editor-smoke command and the canonical address helper exports

- add an optional `npm run smoke:editor` script that installs the local package into an isolated userDir, starts a temporary Node-RED runtime, imports `kvhostlink-basic-read-write.json`, and verifies the flow starts cleanly
- refresh README, user guide, and example-flow docs with the editor-smoke command and the canonical address helper exports

## 0.2.0

- Initial Node-RED KV Host Link nodes for KEYENCE PLCs
- High-level `kvhostlink-connection`, `kvhostlink-read`, and `kvhostlink-write` nodes
- Debug-oriented `kvhostlink-device-matrix.json` example flow
- Cross-verified high-level helper behavior with the Python and .NET Host Link libraries
