# Gotchas

Use this page only for library-specific caveats.

Use the shared
[KV Host Link Troubleshooting & Codes](https://fa-yoshinobu.github.io/plc-comm-docs-site/plc-setup/kv/troubleshooting-codes/)
page for common connection, profile, address-shape, write-permission, and PLC
error-code symptoms.

## Current library-specific caveats

| Area | Symptom | Guidance |
| --- | --- | --- |
| Network | An IPv6 literal or IPv6-only host fails before socket creation. | Use an IPv4 address or a host name with an IPv4 DNS result; this library intentionally does not support IPv6. |
| RDC comments | A `:COMMENT` read fails before connect, or malformed bytes close the supplying connection. | Select `text` plus exact `utf8`/`cp932`, or select raw `buffer`. The library never guesses or falls back; `cp932` is Windows-31J/KEYENCE Shift_JIS compatibility. |
| Compound reads | A large `readNamed` can observe values from different PLC instants. | Splitting is read-only and non-atomic. Use one request or a PLC-side consistency handshake when coherence matters. |
| Writes | Numeric/string bit values or bit-in-word selectors are rejected. | Supply JavaScript Booleans for direct-bit writes. Implement bit-in-word policy explicitly at application/PLC level. |
| Outcome unknown | A timeout/cancel/close/invalid response after a write yields `HostLinkOperationOutcomeUnknownError`. | Do not retry automatically; reconcile state, reconnect explicitly, then decide. |
