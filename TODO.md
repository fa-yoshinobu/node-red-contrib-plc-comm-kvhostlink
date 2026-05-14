# TODO

## Device Follow-up

- Investigate `AT` access on a non-KV-X PLC model that has digital trimmers.
  Current status: keep this as pending support in the debug matrix until the
  expected Host Link behavior is verified on a target that actually supports
  `AT`.
  Notes:
  - KV-X500 does not have `AT` digital trimmer access, and the KV-X upper-link
    command table does not list `AT`.
  - `AT1` timed out in the older Node-RED matrix flow.
  - `TRM0-7` is not a drop-in replacement. A raw read probe against
    `192.168.250.100:8501` returned `E1` for `RD TRM0-TRM7` and `RDS TRM0 8`.

## Cross-Stack Alignment

- [x] **Keep control-message behavior aligned**: `connect`, `disconnect`, and `reinitialize` control handling is exposed consistently through the shared connection node and the read/write nodes.
- [x] **Stabilize metadata schema**: The user-facing metadata modes now stay aligned around connection profile and item-count summaries.
- [x] **Keep protocol-specific options explicit**: Transport and timeout stay explicit connection settings. Host Link command framing is fixed to CR termination.
- [x] **Preserve semantic atomicity by default**: Read and write nodes keep the caller-visible logical request shape. Protocol-defined segmentation, when it exists below the node surface, must stay documented and must not be hidden behind fallback semantic changes.
