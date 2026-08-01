# Getting started

## Start here

Use this page for your first KEYENCE KV Host Link read and write from Node-RED. The examples below use `192.168.250.100:8501`.

## Prerequisites

| Requirement | Value |
| --- | --- |
| Node.js | 18 or newer |
| Node-RED | 3.0 or newer |
| PLC endpoint | `192.168.250.100:8501` |
| Transport | TCP unless your PLC setup requires UDP |

## Install

| Step | Action |
| --- | --- |
| 1 | Open Node-RED. |
| 2 | Open **Manage palette**. |
| 3 | Choose **Install**. |
| 4 | Search for `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink`. |
| 5 | Install the package and restart Node-RED if prompted. |

## Choose profile

The connection node requires an exact canonical PLC profile string. Start with the profile that matches your KV family.

| PLC family | Profile to select |
| --- | --- |
| KEYENCE KV-3000 | `keyence:kv-3000` or `keyence:kv-3000-xym` |
| KEYENCE KV-5000 family | `keyence:kv-5000` or `keyence:kv-5000-xym` |
| KEYENCE KV-7000 family | `keyence:kv-7000` or `keyence:kv-7000-xym` |
| KEYENCE KV-8000 | `keyence:kv-8000` or `keyence:kv-8000-xym` |
| KEYENCE KV-X500 family | `keyence:kv-x500` or `keyence:kv-x500-xym` |
| KEYENCE KV-NANO | `keyence:kv-nano` or `keyence:kv-nano-xym` |

## Create a connection node

Add or edit a `kvhostlink-connection` config node.

| Field | Example value | Description |
| --- | --- | --- |
| Name | `KV Host Link TCP` | Display name in the editor. |
| Host | `192.168.250.100` | IP address or host name for your PLC. |
| Port | `8501` | Explicit PLC endpoint port. The editor initially displays the commonly used Host Link port. |
| Transport | `tcp` | Use `tcp` or `udp`. |
| Timeout | `3000` | Response timeout in milliseconds. |
| PLC Profile | `keyence:kv-5000` | Exact canonical profile value for your PLC. |

## Import the basic flow

| Step | Action |
| --- | --- |
| 1 | Open the Node-RED import menu. |
| 2 | Import `examples/flows/kvhostlink-basic-read-write.json`. |
| 3 | Confirm the connection node uses host `192.168.250.100`, port `8501`, and your canonical PLC profile. |
| 4 | Deploy. |
| 5 | Trigger `Read DM100:U`. |
| 6 | Check the debug sidebar for a value. |

## Read your first value

For a single manual read, configure a `kvhostlink-read` node like this:

| Field | Value |
| --- | --- |
| Connection | Your `kvhostlink-connection` node |
| Source | `str` |
| Addresses | `DM100:U` |
| Output | `Single value when one address` |
| Metadata | `Minimal msg.kvhostlink` |
| Errors | `Second output` |

Successful output is written to `msg.payload`.

```json
{
  "payload": 123
}
```

## Read a device comment

An address such as `DM145:COMMENT` uses the Host Link `RDC` command. The read
node requires an explicit **RDC comment** selection before it connects:

- Choose **Decoded text**, then select exactly **UTF-8** or
  **CP932 / Windows-31J**.
- Choose **Raw Buffer** when the stored encoding is unknown or bytes must be
  preserved exactly.

KEYENCE material may call Windows-31J-compatible data “Shift_JIS”; this library
names that selection `cp932` and does not expose a separate strict Shift_JIS
mode. It never guesses from bytes or PLC profile, retries another codec, or
inserts replacement characters for malformed input.

## First write

For a single manual write, configure a `kvhostlink-write` node like this:

| Field | Value |
| --- | --- |
| Connection | Your `kvhostlink-connection` node |
| Source | `str` |
| Static updates | `{"DM100:U":123}` |
| Metadata | `Minimal msg.kvhostlink` |
| Errors | `Second output` |

Use only a test address that is safe for your machine and PLC program.
The table above shows the write-node input shape; it does not by itself provide
a restore sequence. The imported starter flow provides the safer demonstration:
`Test DM100:U (random + restore)` reads and saves the original value, writes a
random different unsigned value, restores the saved value, and reads again.
Restoration is best effort and cannot be guaranteed if the PLC or connection
fails during the sequence, so use only a controlled test address.

## Confirm success

| Check | Expected result |
| --- | --- |
| Connection status | The connection node status changes to connected during the request. |
| Read status | The read node reports `1 item(s)`. |
| Debug output | The debug sidebar shows `msg.payload`. |
| Error output | The error output stays quiet. |
| Write path | The optional starter-flow path writes a random valid value only after saving the original. |
| Restore readback | The final read shows the restored original value. |

## If it does not work

| Symptom | Check |
| --- | --- |
| Timeout immediately | Confirm the explicitly saved port; Host Link commonly uses `8501`, not SLMP port `1025`. |
| Profile dropdown rejects a value | Use only the exact values in [PLC profiles](PROFILES.md). |
| First import feels too large | Import `kvhostlink-basic-read-write.json` first, not the device-matrix flow. |
| Timer/counter preset write fails | Timer/counter preset writes only work on KV-8000/7000-series CPU units. |
| Transport fails | Check that your PLC Host Link setting allows the selected TCP or UDP transport. |
