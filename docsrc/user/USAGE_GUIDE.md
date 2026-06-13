# Usage guide

## Available nodes

| Node | Purpose |
| --- | --- |
| `kvhostlink-connection` | Shared KEYENCE KV Host Link TCP/UDP connection config. |
| `kvhostlink-read` | Reads one or more high-level addresses into `msg.payload`. |
| `kvhostlink-write` | Writes one or more high-level address/value updates. |

## kvhostlink-connection config node

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| Name | No | Empty | Display name. |
| Host | Yes | Empty | PLC host name or IP address. |
| Port | Yes | `8501` | TCP or UDP port. |
| Transport | Yes | `tcp` | `tcp` or `udp`. |
| Timeout ms | Yes | `3000` | Response timeout in milliseconds. |
| PLC Profile | Yes | `keyence:kv-x500` | Canonical lowercase profile value. |

Accepted profile values are listed in [PLC profiles](PROFILES.md).

## kvhostlink-read node

| Config field | Description |
| --- | --- |
| Name | Display name. |
| Connection | `kvhostlink-connection` config node. |
| Source | Literal text, `msg`, `flow`, `global`, or `env`. |
| Addresses | Literal address list when Source is `str`. |
| Output | `object`, `array`, or single `value` when one address is requested. |
| Metadata | `full`, `minimal`, or `off`. |
| Errors | `throw`, `msg.error`, or second output. |

| Input msg field | Description |
| --- | --- |
| `msg.addresses` | String or array of addresses. Takes priority over the configured source. |
| `msg.payload` | String or array of addresses when `msg.addresses` is not set. |
| `msg.topic` | `connect`, `disconnect`, or `reinitialize` for connection control. |
| `msg.connect` | Set to `true` to connect. |
| `msg.disconnect` | Set to `true` to disconnect. |
| `msg.reinitialize` | Set to `true` to close and reconnect. |

| Output msg field | Description |
| --- | --- |
| `msg.payload` | Read result as an object, array, or scalar value. |
| `msg.kvhostlink` | Metadata when enabled. |
| `msg.error` | Error object when Errors is `msg.error`. |

## kvhostlink-write node

| Config field | Description |
| --- | --- |
| Name | Display name. |
| Connection | `kvhostlink-connection` config node. |
| Source | Literal text, `msg`, `flow`, `global`, or `env`. |
| Static updates | JSON object or `address=value` lines when Source is `str`. |
| Metadata | `full`, `minimal`, or `off`. |
| Errors | `throw`, `msg.error`, or second output. |

| Input msg field | Description |
| --- | --- |
| `msg.updates` | Object or string updates. Takes priority over `msg.payload`. |
| `msg.payload` | Object or string updates when `msg.updates` is not set. |
| `msg.address` | Single address for one write. |
| `msg.dtype` | Optional data type inserted into `msg.address` when the address has no type suffix. |
| `msg.value` | Single write value. If omitted, `msg.payload` is used. |
| `msg.topic` | `connect`, `disconnect`, or `reinitialize` for connection control. |
| `msg.connect` | Set to `true` to connect. |
| `msg.disconnect` | Set to `true` to disconnect. |
| `msg.reinitialize` | Set to `true` to close and reconnect. |

| Output msg field | Description |
| --- | --- |
| `msg.payload` | Original payload is passed through. |
| `msg.kvhostlink` | Metadata when enabled. |
| `msg.error` | Error object when Errors is `msg.error`. |

The second output receives a copy of the message with `error` when Errors is `Second output`.

## Address syntax

| Form | Example | Meaning |
| --- | --- | --- |
| Word value | `DM100` | Read or write the default unsigned word value. |
| Signed 16-bit | `DM100:S` | Interpret one word as signed 16-bit. |
| Unsigned 32-bit | `DM120:D` | Interpret two words as unsigned 32-bit. |
| Signed 32-bit | `DM130:L` | Interpret two words as signed 32-bit. |
| Float32 | `DM130:F` | Interpret two words as a 32-bit float. |
| Hex word | `DM140:H` | Read or write a word as uppercase hexadecimal text. |
| Comment read | `DM145:COMMENT` | Read the device comment string. |
| Bit in word | `DM150.3` | Read or write bit 3 in `DM150`. |
| Word array | `DM160,4` | Read or write four consecutive default values. |
| Bit array | `R200,4` | Read or write four consecutive relay bits. |
| Timer preset | `T10` | Read timer preset value. |
| Counter preset | `C10` | Read counter preset value. |

Use `:` for data types and `.0` through `.F` for bit-in-word access.
`DM100.D` means bit `D` inside `DM100`; use `DM100:D` for a 32-bit value.

## Timer and counter

`T10` and `C10` use the high-level timer/counter behavior.
Reads return the preset value for compatibility with ordinary scalar reads.
Timer/counter preset writes use Host Link `WS` and `WSS`, which are supported only on KV-8000/7000-series CPU units.
Other CPU units may return PLC error `E1`.

Use `TC`, `TS`, `CC`, and `CS` when you want the timer/counter current/contact device families directly.

## Connection control messages

Both read and write nodes accept connection control messages.

| Message | Action |
| --- | --- |
| `msg.topic = "connect"` | Connect the shared connection. |
| `msg.topic = "disconnect"` | Disconnect the shared connection. |
| `msg.topic = "reinitialize"` | Disconnect, then connect again. |
| `msg.connect = true` | Connect the shared connection. |
| `msg.disconnect = true` | Disconnect the shared connection. |
| `msg.reinitialize = true` | Disconnect, then connect again. |

## Metadata output

| Metadata mode | `msg.kvhostlink` fields |
| --- | --- |
| `full` | Read nodes add `addresses` and `connection`; write nodes add `updates` and `connection`. |
| `minimal` | Adds `itemCount` and `metadataMode`. |
| `off` | Leaves `msg.kvhostlink` unchanged. |

The connection metadata contains `host`, `port`, `transport`, and `timeout`.

## Error handling

| Errors setting | Behavior |
| --- | --- |
| `Throw` | Calls Node-RED `done(error)`. |
| `msg.error` | Adds the error object to `msg.error` and sends the message on output 1. |
| `Second output` | Sends normal messages on output 1 and error messages on output 2. |
