# Supported registers

These device families and ranges come from the node source validation layer.

## Word device families

| Family | Address range | Number base | Notes |
| --- | --- | --- | --- |
| `DM` | `0..65534` | Decimal | Data memory. |
| `EM` | `0..65534` | Decimal | Expansion data memory. |
| `FM` | `0..32767` | Decimal | File memory. |
| `ZF` | `0..524287` | Decimal | Large file memory. |
| `W` | `0..7FFF` | Hex | Link register word. |
| `TM` | `0..511` | Decimal | Timer monitor word. |
| `Z` | `1..12` | Decimal | Index register. |
| `T` | `0..3999` | Decimal | Timer preset/current composite. |
| `TC` | `0..3999` | Decimal | Timer current/contact family. |
| `TS` | `0..3999` | Decimal | Timer current/contact family. |
| `C` | `0..3999` | Decimal | Counter preset/current composite. |
| `CC` | `0..3999` | Decimal | Counter current/contact family. |
| `CS` | `0..3999` | Decimal | Counter current/contact family. |
| `AT` | `0..7` | Decimal | Digital trimmer values; read only in the high-level write helpers. |
| `CM` | `0..7599` | Decimal | Control memory. |
| `VM` | `0..589823` | Decimal | Variable memory. |
| `D` | `0..65534` | Decimal | XYM-style word alias. |
| `E` | `0..65534` | Decimal | XYM-style word alias. |
| `F` | `0..32767` | Decimal | XYM-style word alias. |

## Bit device families

| Family | Address range | Number base | Notes |
| --- | --- | --- | --- |
| `R` | `0..199915` | Decimal bit-bank | Lower two digits must be `00..15`. |
| `B` | `0..7FFF` | Hex | Bit family. |
| `MR` | `0..399915` | Decimal bit-bank | Lower two digits must be `00..15`. |
| `LR` | `0..99915` | Decimal bit-bank | Lower two digits must be `00..15`. |
| `CR` | `0..7915` | Decimal bit-bank | Lower two digits must be `00..15`. |
| `VB` | `0..F9FF` | Hex | Bit family. |
| `X` | `0..1999F` | Decimal bank plus hex bit | Input bit. |
| `Y` | `0..1999F` | Decimal bank plus hex bit | Output bit. |
| `M` | `0..63999` | Decimal | XYM-style internal relay alias. |
| `L` | `0..15999` | Decimal | XYM-style latch relay alias. |

## Address syntax

| Form | Example | Meaning |
| --- | --- | --- |
| Unsigned word | `DM100:U` | Read/write using an explicit unsigned word format. |
| Signed word | `DM100:S` | Signed 16-bit value. |
| Unsigned dword | `DM120:D` | Unsigned 32-bit value. |
| Signed long | `DM130:L` | Signed 32-bit value. |
| Float | `DM140:F` | 32-bit floating point value. |
| Hex | `DM140:H` | Hexadecimal word text. |
| Comment | `DM145:COMMENT` | Read device comment text. |
| Bit in word | `DM150.3` | Bit 3 in `DM150`. |
| Count | `DM160:U,4` | Four consecutive unsigned word values. |
| Direct bit count | `R200:BIT,4` | Four consecutive direct bits. |
| Timer | `T10:D` | Timer preset value. |
| Counter | `C10:D` | Counter preset value. |

## Addressing notes

`X` and `Y` use decimal bank plus hexadecimal bit notation.
Use `X10F`, not `X275`.

`R`, `MR`, `LR`, and `CR` use two-digit bit notation inside a decimal bank.
Use `R200`, not a hex-only form.

`AT` is validated for reads but rejected by the high-level write helpers before sending because it is not listed in the Host Link `WR`/`WRS` device table.

Counts are limited by the Host Link command rules.
Most families allow up to 1000 values, or 500 for 32-bit formats.
`TM` allows up to 512 values, or 256 for 32-bit formats.
`Z` allows up to 12, `AT` allows up to 8, and timer/counter families allow up to 120.

See [PLC profiles](PROFILES.md) for supported connection profiles.
