# Example flows

## What is in this directory

This directory contains importable Node-RED JSON flows for `kvhostlink-read`, `kvhostlink-write`, and the shared `kvhostlink-connection` node.
Start with the basic flow, then move through typed and array examples before using the device matrix.
Use only test addresses that are safe for your PLC program before you run any write example. These flows intentionally keep writes simple and do not restore previous values automatically; add a restore write in your copied flow when needed.

## How to import

1. Open Node-RED.
2. Open the menu and choose **Import**.
3. Paste the JSON from the flow file.
4. Import the flow.
5. Open the `kvhostlink-connection` config node.
6. Confirm host `192.168.250.100`, port `8501`, and change the example PLC Profile if your PLC is not `keyence:kv-5000`.
7. Deploy.

## Polling reconnect

The `kvhostlink-connection` config node does not run a background reconnect timer by itself. It keeps one shared client and lets `kvhostlink-read` / `kvhostlink-write` send `connect`, `disconnect`, or `reinitialize` control messages through `msg.topic` or `msg.reinitialize`.

For a 24-hour polling flow, use an Inject node for the read interval, route the read node's error output or a Catch node to a Delay node, then send `msg.topic = "reinitialize"` back to the same read node before the next read. Start with a 1 second delay and cap the retry delay around 30 seconds. Keep the polling path read-only unless the flow is deliberately testing writes.

## Operational recipes

`kvhostlink-multi-plc-monitor.json` is the read-only multi-PLC monitor recipe. It polls two connection config nodes, emits long-form rows shaped as `timestamp,plc,tag,value`, and uses `connected`, `lost`, `reconnecting`, and `recovered` state transitions with a 1 second to 30 second backoff.

For config-driven polling, keep the config in an Inject or Function node and feed `msg.addresses` into `kvhostlink-read`. A compact JSON shape is:

```json
{"plcs":[{"name":"line-a","connection":"cfg-kv-monitor-a","tags":[{"name":"dm100","address":"DM100:U"}]}],"interval":1,"initialBackoffMs":1000,"maxBackoffMs":30000}
```

## Flow index

| File | What it demonstrates | First-time use order |
| --- | --- | --- |
| `kvhostlink-basic-read-write.json` | Reads `DM100:U`, writes `DM100:U=123`, and reads back the value. | 1 |
| `kvhostlink-multi-plc-monitor.json` | Read-only multi-PLC monitor with long-form row output and reconnect backoff. | 1 after connection settings are known |
| `kvhostlink-typed-read-write.json` | Uses `:S`, `:D`, `:L`, `:F`, and `.bit` forms. | 2 |
| `kvhostlink-array-read-write.json` | Uses `,count` forms such as `DM160:U,4` and `R200:BIT,4`. | 3 |
| `kvhostlink-device-matrix.json` | Runs one-by-one read/write checks across many device families and records JSONL results. | After the first three flows work |
