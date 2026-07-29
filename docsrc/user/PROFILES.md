# PLC profiles

## Intro

The `kvhostlink-connection` node stores a canonical PLC profile value.
Use the lowercase value from the table; legacy labels such as `KV-X500` are rejected.
Models not represented below, including KV-700 and KV-1000, do not currently
have a canonical profile.
Use `profileDescriptors()` from `lib/hostlink/plc-profile` when a UI needs
canonical names, display labels, connection eligibility, and XYM base-profile
metadata. This descriptor list is the stable source for selectors; store the
canonical profile string, not the display name.

## Verified hardware available for validation

The maintainer owns the hardware listed below. Communication has been verified
on this hardware, and it is available for focused reproduction and validation
when a problem is reported.

"Verified" does not mean that every library feature has been tested on every
listed PLC or module. Exhaustively testing every combination would require a prohibitive
amount of work.

| PLC family | Hardware owned by the maintainer |
| --- | --- |
| KEYENCE KV series | `KV-X500`, `KV-5000`, `KV-7000`, `KV-XLE02` |

## Device families and ranges

Device-family notation, type suffixes, XYM aliases, and static range tables are shared across the KV Host Link libraries. Use the common [KV Host Link Device Ranges](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/device-ranges/) page for those details.

The table below identifies the canonical profile names, intended hardware, and
address notation. Device ranges remain in the shared reference above.

## Supported PLC profiles

| Canonical profile | Display name | Intended hardware | Address notation |
| --- | --- | --- | --- |
| `keyence:kv-nano` | KEYENCE KV-NANO | `KV-N24nn`, `KV-N40nn`, `KV-N60nn`, `KV-NC32T` | Native KV notation. |
| `keyence:kv-nano-xym` | KEYENCE KV-NANO (XYM) | Same KV-NANO family | XYM aliases over `keyence:kv-nano`. |
| `keyence:kv-3000` | KEYENCE KV-3000 | `KV-3000` | Native KV notation. |
| `keyence:kv-3000-xym` | KEYENCE KV-3000 (XYM) | Same KV-3000 family | XYM aliases over `keyence:kv-3000`. |
| `keyence:kv-5000` | KEYENCE KV-5000 | `KV-5000`, `KV-5500` | Native KV notation. |
| `keyence:kv-5000-xym` | KEYENCE KV-5000 (XYM) | Same KV-5000 family | XYM aliases over `keyence:kv-5000`. |
| `keyence:kv-7000` | KEYENCE KV-7000 | `KV-7000`, `KV-7300`, `KV-7500` | Native KV notation. |
| `keyence:kv-7000-xym` | KEYENCE KV-7000 (XYM) | Same KV-7000 family | XYM aliases over `keyence:kv-7000`. |
| `keyence:kv-8000` | KEYENCE KV-8000 | `KV-8000`, `KV-8000A` | Native KV notation. |
| `keyence:kv-8000-xym` | KEYENCE KV-8000 (XYM) | Same KV-8000 family | XYM aliases over `keyence:kv-8000`. |
| `keyence:kv-x500` | KEYENCE KV-X500 | `KV-X310`, `KV-X500`, `KV-X520`, `KV-X530`, `KV-X550` | Native KV notation. |
| `keyence:kv-x500-xym` | KEYENCE KV-X500 (XYM) | Same KV-X500 family | XYM aliases over `keyence:kv-x500`. |

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

- KV-NANO profiles do not include `EM`, `FM`, `ZF`, or `AT`. Use `DM` for a
  first read and check the shared device-range reference before using
  model-specific areas.
- KV-NANO, KV-3000, and KV-5000 profile data includes `CTH` and `CTC` rows.
  Actual availability remains model- and unit-dependent.
- KV-7000 and KV-8000 profiles do not include `CTH` or `CTC`. Timer/counter
  preset writes use Host Link `WS` and `WSS`, which are documented for these
  CPU families; other CPU units may return PLC error `E1`.
- KV-X500 profiles do not include `AT`, `VM`, `VB`, `CTH`, or `CTC`.
- In any `-xym` profile, `X` and `Y` use decimal bank digits followed by one
  hexadecimal bit digit, such as `X10F`.

`AT` reads are available only when the selected profile includes `AT`. The
high-level write helpers reject `AT` before sending. If an address is accepted
by the profile data but is outside the actual PLC model's range, the node
returns the PLC response as a runtime error.
