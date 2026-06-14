# Example flows

## What is in this directory

This directory contains importable Node-RED JSON flows for `kvhostlink-read`, `kvhostlink-write`, and the shared `kvhostlink-connection` node.
Start with the basic flow, then move through typed and array examples before using the device matrix.

## How to import

1. Open Node-RED.
2. Open the menu and choose **Import**.
3. Paste the JSON from the flow file.
4. Import the flow.
5. Open the `kvhostlink-connection` config node.
6. Confirm host `192.168.250.100`, port `8501`, and the canonical PLC Profile for your PLC.
7. Deploy.

## Flow index

| File | What it demonstrates | First-time use order |
| --- | --- | --- |
| `kvhostlink-basic-read-write.json` | Reads `DM100`, writes `DM100=123`, and reads back the value. | 1 |
| `kvhostlink-typed-read-write.json` | Uses `:S`, `:D`, `:L`, `:F`, and `.bit` forms. | 2 |
| `kvhostlink-array-read-write.json` | Uses `,count` forms such as `DM160,4` and `R200,4`. | 3 |
| `kvhostlink-device-matrix.json` | Runs one-by-one read/write checks across many device families and records JSONL results. | After the first three flows work |
