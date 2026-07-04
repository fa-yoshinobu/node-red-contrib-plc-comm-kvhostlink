# Troubleshooting

Use this page for first-pass checks when a KV Host Link node does not behave as expected. For address-shape details, see [GOTCHAS.md](GOTCHAS.md).

## Connection checks

| Symptom | Check |
| --- | --- |
| Timeout immediately after deploy | Confirm the `kvhostlink-connection` host and port. Examples use port `8501`. |
| TCP connection refused | Confirm the PLC Ethernet connection is enabled and listening on the selected port. |
| UDP requests do not return | Confirm the PLC UDP port and selected transport in the connection node. |
| Intermittent timeouts | Increase timeout settings and avoid triggering many independent tiny requests at once. |

## Profile and address checks

| Symptom | Check |
| --- | --- |
| Profile rejected in the editor or runtime | Use one exact canonical profile from [PROFILES.md](PROFILES.md). |
| Device address returns `E0` | Check the selected profile and the PLC model range before using that address. |
| `X` or `Y` is rejected | Use decimal-bank plus hex-bit notation such as `X10F:BIT`. |
| `R`, `MR`, `LR`, or `CR` is rejected | Use KEYENCE two-digit bit notation such as `R200:BIT`. |
| `DM100.D` returns a bit | Use `DM100:D` for a 32-bit value; dot notation selects a bit in a word. |

## Write checks

| Symptom | Check |
| --- | --- |
| Write returns `E4` | Check PLC write protection and project settings. |
| Timer/counter preset write returns `E1` | Preset writes are for KV-8000/7000-series. Do not use them on unsupported models. |
| `:COMMENT` write is rejected | Comments are read-only through the high-level nodes. |

