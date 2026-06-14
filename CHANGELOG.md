# Changelog

## 0.8.0 - 2026-06-14

- bump the package revision to 0.8.0 for the unified PLC communication library release

## 0.2.11 - 2026-06-12

- bump the package revision for release alignment after the resolved live-validation pass

## 0.2.10 - 2026-05-14

- add high-level `readTimerCounter()`, `readTimer()`, and `readCounter()`
  helpers for full `T` / `C` composite values
- add low-level `HostLinkClient` helpers for expansion unit buffer `URD` / `UWR`
  access and frame them with the verified `address.suffix` command form
- add low-level `HostLinkClient.switchBank()` for the `BE` bank-switch command
  used by PLC models that support data banks; KV-X500 is treated as non-target
- clarify that `WS` / `WSS` timer/counter preset writes are KV-8000/7000-series
  commands; other CPU units do not support them and return abnormal response
  `E1` when executed

## 0.2.9 - 2026-05-14

- batch `readNamed()` direct-bit requests for Host Link bit devices, including `R` / `MR` / `LR` / `CR` bit-bank display boundaries such as `CR3615` to `CR3700`
- reject common Host Link device span overflows before sending, while still leaving PLC model-specific range validation to the connected PLC response
- bump the package revision for the Host Link span-validation fix

## 0.2.8 - 2026-05-02

- bump the release revision for npm and Node-RED Flow Library publishing; older Flow Library entries may still show `0.2.0`
- refresh README, user-guide, and example-flow docs with compatibility notes from the published Flow Library version
- document the public compatibility change that Host Link command framing is fixed to CR termination
- document the expanded current surface since Flow Library `0.2.0`: timeout setting, metadata modes, connection control messages, comment reads, and canonical address helper exports
- update the `kvhostlink-device-matrix.json` documentation for one-click run-all read/write buttons, auto-run status lamp feedback, timeout tracking, JSONL logging, and non-overlapping buttons
- document the 2026-05-02 KV-5000 matrix result: 35 catalog samples, 157 completed JSONL records, and all records `OK`

## 0.2.7 - 2026-05-02

- remove the interim device-range catalog helper from the Node-RED package
- stop rejecting device addresses by built-in common range limits; ordinary read/write validation now checks address format and Host Link command constraints, leaving actual range errors to the PLC response

## 0.2.6 - 2026-05-02

- remove the `Append LF` connection option and always send Host Link commands with CR termination

## 0.2.5 - 2026-05-02

- bump package revision and update `iconv-lite` to `^0.7.2`

## 0.2.4 - 2026-04-27

- add X/Y monitor registration support verified on KV-7500
- normalize X/Y bit addresses as decimal bank plus hexadecimal bit notation, rejecting invalid forms such as `X3F0` before sending
- add M/L monitor bit registration support while keeping M/L out of monitor word registration

## 0.2.3 - 2026-04-27

- align Host Link device parsing with the .NET/Rust libraries, including the extended `M0..M63999` XYM range
- add an interim KEYENCE KV device-range catalog helper
- normalize `R`, `MR`, `LR`, and `CR` bit-bank addresses and reject invalid lower-two-digit bit numbers

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
