# Latest communication verification

This page is the retained public summary for live-device checks that are
referenced from the README.

## Current retained summary

| Date | PLC / CPU | Canonical profile | Transport | Verified scope | Limitations | Record |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-05-02 | KEYENCE KV-5000 class target | `keyence:kv-5000` | Host Link TCP | Device-matrix flow with 35 catalog samples and 157 completed JSONL result records. | All retained records were marked `OK`; the JSONL result files are not committed as public artifacts. | [CHANGELOG 0.2.8](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/CHANGELOG.md) |
| 2026-05-14 | KEYENCE KV-7500 | `keyence:kv-7000` | Host Link TCP `192.168.250.100:8501` | `AT` digital trimmer read verification: raw `RD AT0.D`, public high-level `AT0`, raw `RD AT7.D`, and raw `RDS AT0.D 8`. | `AT` is read-oriented in the public helper surface. Write helpers reject `AT` before sending; raw write returned PLC `E1`. | [TODO device follow-up](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/TODO.md) |
| 2026-05-14 | KEYENCE KV-X500 family | `keyence:kv-x500` | Host Link TCP | Confirmed non-target behavior for `AT` digital trimmer access. | KV-X500 does not expose `AT`; use the profile-specific public register table before adding trimmer reads. | [TODO device follow-up](https://github.com/fa-yoshinobu/node-red-contrib-plc-comm-kvhostlink/blob/main/TODO.md) |

## Practical conclusions

- The Node-RED package stores canonical profile strings such as
  `keyence:kv-5000` and `keyence:kv-7000`.
- KV-3000 and KV-5000 are separate profiles; the old combined
  `keyence:kv-3000-5000` style is intentionally not accepted.
- `AT0` through `AT7` are valid public read targets for the verified KV-7500
  setup, but they are not a universal KV-family feature.
- `TRM0-7` is not a drop-in replacement for `AT0-7`; retained raw probes
  returned PLC `E1`.

## When adding a new validation result

Keep this page as the public summary. Add the date, PLC model, canonical
profile, transport, verified range, limitations, and a retained note or log
reference. Do not put the verification table back into README.
