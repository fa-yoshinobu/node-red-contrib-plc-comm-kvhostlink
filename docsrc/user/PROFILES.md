# PLC profiles

## Intro

The `kvhostlink-connection` node stores a canonical PLC profile value.
Use the lowercase value from the table; legacy labels such as `KV-X500` are rejected.

## Supported KV models

| PLC profile | Intended KV family | Addressing note |
| --- | --- | --- |
| `keyence:kv-nano` | KV Nano | Standard profile. |
| `keyence:kv-nano-xym` | KV Nano | XYM-style profile. |
| `keyence:kv-3000-5000` | KV-3000 / KV-5000 | Standard profile. |
| `keyence:kv-3000-5000-xym` | KV-3000 / KV-5000 | XYM-style profile. |
| `keyence:kv-7000` | KV-7000 | Standard profile. |
| `keyence:kv-7000-xym` | KV-7000 | XYM-style profile. |
| `keyence:kv-8000` | KV-8000 | Standard profile. |
| `keyence:kv-8000-xym` | KV-8000 | XYM-style profile. |
| `keyence:kv-x500` | KV-X500 | Standard profile. |
| `keyence:kv-x500-xym` | KV-X500 | XYM-style profile. |

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
