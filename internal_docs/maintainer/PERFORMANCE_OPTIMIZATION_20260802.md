# HostLink performance optimization acceptance record (2026-08-02)

## PERF2-001 — Incremental TCP receive framing

Target contract: one connection-owned growable accumulator retains incomplete TCP data, scans only newly available bytes, and publishes an independently owned response. A trace hook receives its own snapshot; disabled tracing adds no trace snapshot.

Acceptance evidence:

- [x] A 65,536-byte body delivered one byte at a time has linear scan/copy counters.
- [x] A mutating trace callback cannot corrupt the response or transport storage.
- [x] Connection retirement releases retained accumulator capacity.

## PERF2-006 — O(1) FIFO maintenance

Target contract: enqueue, dequeue, and cancellation removal use linked-node operations without `shift`, `indexOf`, or `splice`; close may drain once in O(n).

Acceptance evidence:

- [x] Admission uses a linked FIFO with waiter-owned node references.
- [x] Source-contract and existing lifecycle/concurrency tests cover the queue behavior.

No public API, Node-RED flow schema, wire request, or supported behavior changed. User/API documentation needs no migration update. Live PLC verification is not required because deterministic local-socket tests cover the framing and ownership changes.
