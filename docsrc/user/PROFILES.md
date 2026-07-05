# PLC profiles

## Intro

The `kvhostlink-connection` node stores a canonical PLC profile value.
Use the lowercase value from the table; legacy labels such as `KV-X500` are rejected.
Use `displayName(profileId)` from `lib/hostlink/plc-profile` when you need the
same UI label outside the editor. Store the canonical profile string, not the
display name.

## Device families and ranges

Device-family notation, type suffixes, XYM aliases, and static range tables are shared across the KV Host Link libraries. Use the common [KV Host Link Device Ranges](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/device-ranges/) page for those details.

The table below only identifies the canonical profile values available in the connection node.

## Supported PLC profiles

| Canonical profile | Display name | Addressing note |
| --- | --- | --- |
| `keyence:kv-nano` | KEYENCE KV-NANO | Standard profile. |
| `keyence:kv-nano-xym` | KEYENCE KV-NANO (XYM) | XYM-style profile. |
| `keyence:kv-3000` | KEYENCE KV-3000 | Standard profile. |
| `keyence:kv-3000-xym` | KEYENCE KV-3000 (XYM) | XYM-style profile. |
| `keyence:kv-5000` | KEYENCE KV-5000 | Standard profile. |
| `keyence:kv-5000-xym` | KEYENCE KV-5000 (XYM) | XYM-style profile. |
| `keyence:kv-7000` | KEYENCE KV-7000 | Standard profile. |
| `keyence:kv-7000-xym` | KEYENCE KV-7000 (XYM) | XYM-style profile. |
| `keyence:kv-8000` | KEYENCE KV-8000 | Standard profile. |
| `keyence:kv-8000-xym` | KEYENCE KV-8000 (XYM) | XYM-style profile. |
| `keyence:kv-x500` | KEYENCE KV-X500 | Standard profile. |
| `keyence:kv-x500-xym` | KEYENCE KV-X500 (XYM) | XYM-style profile. |

## How to configure the connection node

| Field | Example | Description |
| --- | --- | --- |
| Name | `KV Host Link TCP` | Editor display name. |
| Host | `192.168.250.100` | PLC IP address or host name. |
| Port | `8501` | Host Link TCP/UDP port. |
| Transport | `tcp` | `tcp` or `udp`. |
| Timeout ms | `3000` | Response timeout in milliseconds. |
| PLC Profile | `keyence:kv-x500` | Canonical PLC profile value. |

## Model-specific cautions

Common address validation is protocol-wide.
If an address is valid for the common Host Link family but outside your PLC model's actual range, the PLC response is returned as the runtime error.

Timer/counter preset writes use Host Link `WS` and `WSS`.
Those commands are documented for KV-8000/7000-series CPU units; other CPU units may return PLC error `E1`.

`AT` digital trimmer reads were verified on KV-7500, but KV-X500 does not have `AT` digital trimmer access.
The high-level write helpers reject `AT` before sending.
