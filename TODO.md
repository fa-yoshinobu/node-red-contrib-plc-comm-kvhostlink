# TODO

## Device Follow-up

- Investigate `AT` access on real PLCs.
  Current status: keep this as pending support in the debug matrix until the expected Host Link behavior is verified.
  Notes:
  - `AT1` timed out in the Node-RED matrix flow.
  - `TRM0-7` is not a drop-in replacement. A raw read probe against `192.168.250.100:8501` returned `E1` for `RD TRM0-TRM7` and `RDS TRM0 8`.