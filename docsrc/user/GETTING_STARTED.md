# Getting started

## Start here

Use this page for your first KEYENCE KV Host Link read and write from Node-RED.
The examples below use `192.168.250.100:8501`.

## Prerequisites

| Requirement | Value |
| --- | --- |
| Node-RED | 3.0 or newer |
| PLC endpoint | `192.168.250.100:8501` |
| Transport | TCP unless your PLC setup requires UDP |

## Install

1. Open Node-RED.
2. Open **Manage palette**.
3. Choose **Install**.
4. Search for `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink`.
5. Install the package and restart Node-RED if prompted.

## Create a connection node

Add or edit a `kvhostlink-connection` config node.

| Field | Example value | Description |
| --- | --- | --- |
| Name | `KV Host Link TCP` | Display name in the editor. |
| Host | `192.168.250.100` | IP address or host name for your PLC. |
| Port | `8501` | Default KEYENCE KV Host Link TCP/UDP port. |
| Transport | `tcp` | Use `tcp` or `udp`. |
| Timeout | `3000` | Response timeout in milliseconds. |

The connection node also has a **PLC Profile** selector. Start with the profile that matches your KV family, such as `keyence:kv-x500`.

## Import the basic flow

1. Open the Node-RED import menu.
2. Import `examples/flows/kvhostlink-basic-read-write.json`.
3. Confirm the connection node uses host `192.168.250.100` and port `8501`.
4. Deploy.
5. Trigger `Read DM100`.
6. Check the debug sidebar for a value.

## Read your first value

For a single manual read, configure a `kvhostlink-read` node like this:

| Field | Value |
| --- | --- |
| Connection | Your `kvhostlink-connection` node |
| Source | `str` |
| Addresses | `DM100` |
| Output | `Single value when one address` |
| Metadata | `Minimal msg.kvhostlink` |
| Errors | `Second output` |

Successful output is written to `msg.payload`.

```json
{
  "payload": 123
}
```

## Confirm success

1. The connection node status changes to connected during the request.
2. The read node reports `1 item(s)`.
3. The debug sidebar shows `msg.payload`.
4. The error output stays quiet.

## If it does not work

- Default port is `8501`, not `1025`.
- Import `kvhostlink-basic-read-write.json` first, not the device-matrix flow.
- Timer/counter preset writes only work on KV-8000/7000-series CPU units.
- Check that your PLC Host Link setting allows the selected TCP or UDP transport.

## Next pages

- [Usage guide](USAGE_GUIDE.md)
- [Supported registers](SUPPORTED_REGISTERS.md)
