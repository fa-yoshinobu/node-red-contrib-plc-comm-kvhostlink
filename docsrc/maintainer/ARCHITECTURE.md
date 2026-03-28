# Architecture

This package mirrors the layered shape used by the SLMP Node-RED package.

- `lib/hostlink/protocol.js`
  Host Link frame encoding, decoding, and token parsing.
- `lib/hostlink/client.js`
  TCP or UDP transport, command dispatch, and raw protocol operations.
- `lib/hostlink/high-level.js`
  High-level typed read/write helpers used by the Node-RED nodes and cross-verify harness.
- `nodes/`
  Node-RED editor and runtime nodes.
- `examples/flows/`
  Importable flows for validation and debugging.
