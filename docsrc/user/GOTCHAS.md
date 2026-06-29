# Gotchas

## Timeout immediately

| Field | Detail |
| --- | --- |
| Symptom | The read or write node reports a timeout as soon as you deploy or trigger it. |
| Root cause | KV Host Link uses port `8501`, not the SLMP/Computerlink port `1025`. |
| Fix | Open the `kvhostlink-connection` node and set **Port** to `8501`. |

## Timer/counter preset write error

| Field | Detail |
| --- | --- |
| Symptom | Writing `T` or `C` preset values returns a PLC error such as `E1`. |
| Root cause | Preset writes through Host Link `WS` and `WSS` are supported on KV-8000/7000-series CPU units, not every KV model. |
| Fix | Do not write `T` or `C` presets on unsupported models; use read nodes for timer/counter monitoring. |

## X/Y address rejected

| Field | Detail |
| --- | --- |
| Symptom | `X` or `Y` addresses are rejected by the editor or by the PLC. |
| Root cause | `X` and `Y` use decimal-bank plus hex-bit notation. `X10F` means bank 10, bit F. |
| Fix | Use `X10F`, not `X275`, and select an `-xym` profile when you want XYM aliases. |

## R/MR/LR/CR address rejected

| Field | Detail |
| --- | --- |
| Symptom | `R`, `MR`, `LR`, or `CR` addresses are rejected. |
| Root cause | These bit-bank families require two-digit bit notation. |
| Fix | Use `R200`, `MR100`, or another form whose low two digits are `00` through `15`. |

## DM100.D returns a bit, not a dword

| Field | Detail |
| --- | --- |
| Symptom | `DM100.D` behaves like a bit read instead of an unsigned 32-bit read. |
| Root cause | Dot notation means bit-in-word access. |
| Fix | Use `DM100:D` for an unsigned 32-bit value. |

## COMMENT write rejected

| Field | Detail |
| --- | --- |
| Symptom | A write to `DM145:COMMENT` is rejected. |
| Root cause | `:COMMENT` is read-only through the high-level API. |
| Fix | Use `DM145:COMMENT` only with `kvhostlink-read`. |

## Count with bit-in-word rejected

| Field | Detail |
| --- | --- |
| Symptom | `DM150.3,4` or a similar bit-in-word count is rejected. |
| Root cause | Bit-in-word addresses do not support `,count`. |
| Fix | Use `DM150.3` for one bit, or use a direct bit family such as `R200:BIT,4` for bit arrays. |
