# TODO

## Device Follow-up

- [x] Verify `AT` access on a non-KV-X PLC model that has digital trimmers.
  On 2026-05-14, KV-7500 at `192.168.250.100:8501` accepted `AT` as a 32-bit
  value family: `RD AT0.D`, default high-level `AT0`, `RD AT7.D`, and raw
  `RDS AT0.D 8` all succeeded. `WR AT0.D 3533` returned PLC `E1`.
  Notes:
  - KV-X500 does not have `AT` digital trimmer access, and the KV-X upper-link
    command table does not list `AT`.
  - `AT` default suffix is `.D`; the `AT0-7` range is counted by AT device
    point, so `AT7.D` and `RDS AT0.D 8` are valid.
  - `TRM0-7` is not a drop-in replacement. A raw read probe against
    `192.168.250.100:8501` returned `E1` for `RD TRM0-TRM7` and `RDS TRM0 8`.

## Cross-Stack Alignment

- [x] **Keep control-message behavior aligned**: `connect`, `disconnect`, and `reinitialize` control handling is exposed consistently through the shared connection node and the read/write nodes.
- [x] **Stabilize metadata schema**: The user-facing metadata modes now stay aligned around connection profile and item-count summaries.
- [x] **Keep protocol-specific options explicit**: Transport and timeout stay explicit connection settings. Host Link command framing is fixed to CR termination.
- [x] **Preserve semantic atomicity by default**: Read and write nodes keep the caller-visible logical request shape. Protocol-defined segmentation, when it exists below the node surface, must stay documented and must not be hidden behind fallback semantic changes.
