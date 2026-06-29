# Getting started

## Start here

Use this page for your first KEYENCE KV Host Link read and write from Node-RED. The examples below use `192.168.250.100:8501`.

## Prerequisites

| Requirement | Value |
| --- | --- |
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
| KV-3000 | `keyence:kv-3000` or `keyence:kv-3000-xym` |
| KV-5000 / KV-5500 | `keyence:kv-5000` or `keyence:kv-5000-xym` |
| KV-7000 / KV-7300 / KV-7500 | `keyence:kv-7000` or `keyence:kv-7000-xym` |
| KV-8000 | `keyence:kv-8000` or `keyence:kv-8000-xym` |
| KV-X500 family | `keyence:kv-x500` or `keyence:kv-x500-xym` |
| KV-NANO | `keyence:kv-nano` or `keyence:kv-nano-xym` |

## Create a connection node

Add or edit a `kvhostlink-connection` config node.

| Field | Example value | Description |
| --- | --- | --- |
| Name | `KV Host Link TCP` | Display name in the editor. |
| Host | `192.168.250.100` | IP address or host name for your PLC. |
| Port | `8501` | Default KEYENCE KV Host Link TCP/UDP port. |
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
The imported starter flow writes the sample value and does not restore the previous value automatically.

## Confirm success

| Check | Expected result |
| --- | --- |
| Connection status | The connection node status changes to connected during the request. |
| Read status | The read node reports `1 item(s)`. |
| Debug output | The debug sidebar shows `msg.payload`. |
| Error output | The error output stays quiet. |
| Write readback | The follow-up read shows the value written to your test address. |
| Restore plan | You use a test-only address or add a follow-up write that restores the previous value. |

## If it does not work

| Symptom | Check |
| --- | --- |
| Timeout immediately | Default port is `8501`, not `1025`. |
| Profile dropdown rejects a value | Use only the exact values in [PLC profiles](PROFILES.md). |
| First import feels too large | Import `kvhostlink-basic-read-write.json` first, not the device-matrix flow. |
| Timer/counter preset write fails | Timer/counter preset writes only work on KV-8000/7000-series CPU units. |
| Transport fails | Check that your PLC Host Link setting allows the selected TCP or UDP transport. |

## Next pages

| Page | Link |
| --- | --- |
| Usage guide | [USAGE_GUIDE.md](USAGE_GUIDE.md) |
| Supported registers | [SUPPORTED_REGISTERS.md](SUPPORTED_REGISTERS.md) |
| PLC profiles | [PROFILES.md](PROFILES.md) |
| Gotchas | [GOTCHAS.md](GOTCHAS.md) |
