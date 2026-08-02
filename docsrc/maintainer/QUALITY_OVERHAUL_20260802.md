# Quality Overhaul Decisions — 2026-08-02

## HOSTLINK-NODE-BIT-BANK-WRITE-BATCH-001 — Batch consecutive bit-bank writes by logical number

Status: implemented and verified.

Implementation scope: Node.js `writeNamed` planning for direct `BIT` writes to `R`, `MR`, `LR`,
and `CR`; logical-number comparison; request-limit validation; deterministic tests; user
documentation; migration notes; and changelog.

### Observed problem

`writeNamed` currently compares the displayed device numbers when deciding whether direct bit writes
are consecutive. The `R`, `MR`, `LR`, and `CR` families display sixteen bits per decimal bank, so
displayed address `R115` is logical bit 31 and `R200` is logical bit 32. Comparing the display numbers
as ordinary integers incorrectly splits this valid consecutive pair and rejects the update because
`writeNamed` permits only one state-changing Host Link request.

### Target contract

For `writeNamed` entries whose dtype is exactly `BIT` and whose device family is `R`, `MR`, `LR`, or
`CR`, batch start and next-address comparisons use `bitBankLogicalNumber()`. The original first
display address remains the request start. For example, insertion-ordered updates for `R115:BIT`
(logical 31) followed by `R200:BIT` (logical 32) produce one `writeConsecutive` request starting at
`R115`, with values in that same input order.

Within-bank behavior does not change. Forward-consecutive entries remain one batch, and any logical
gap, duplicate logical address, reverse order, device-family change, or dtype change still prevents a
single batch and is rejected before transport under the existing one-request `writeNamed` contract.
The planner does not sort, deduplicate, fill gaps, split, retry, or send a valid subset.

Logical bit-bank conversion must not be applied to another device family or dtype. In particular,
typed `U`, `S`, `H`, `D`, `L`, and `F` values on direct-bit families, `BIT_IN_WORD`, word-device
access, timer/counter set values, and non-bit-bank direct bits retain their existing planning,
validation, and wire behavior.

Existing syntax and limits remain authoritative. Display bit positions `00` through `15` are valid;
positions `16` through `99` remain invalid. Device-span safe-integer checks and the maximum 1000-bit
consecutive-write request limit remain in force before transport.

Compatibility impact: valid `BIT` updates that cross a decimal display-bank boundary in `R`, `MR`,
`LR`, or `CR` change from local multi-request rejection to one transmitted consecutive-write request.
Invalid, duplicate, out-of-order, mixed-family, mixed-dtype, and over-limit updates remain local
failures with zero transmission.

### Machine-verifiable acceptance criteria

1. For each of `R`, `MR`, `LR`, and `CR`, the displayed `115` then `200` pair is recognized as
   logical bits 31 then 32 and produces exactly one `writeConsecutive` call. Its start address is the
   displayed `115` address and its two Boolean values preserve insertion order.
2. Multi-point batches cross one or more `15`-to-next-`00` display boundaries without splitting when
   every logical bit is consecutive. Existing within-bank cases such as displayed `114` then `115`
   produce the same request as before.
3. A logical gap, including displayed `115` then `201`, is rejected by `writeNamed`'s one-request
   rule before FIFO admission or transport. No valid prefix or suffix is sent.
4. Duplicate logical addresses, including differently formatted strings that resolve to the same
   bit, and reverse-ordered consecutive addresses are rejected before FIFO admission or transport.
   The planner neither deduplicates nor reorders caller entries.
5. Mixed `R`/`MR`/`LR`/`CR` families and a change between `BIT` and any other dtype do not merge,
   even when their numeric or logical values appear consecutive. The complete update is rejected if
   it would require more than one request.
6. `bitBankLogicalNumber()` is used for batch continuity only when dtype is `BIT` and the family is
   in `BIT_BANK_DEVICE_TYPES`. Regression tests prove that typed values on direct-bit families,
   `BIT_IN_WORD`, timer/counter set values, word families, and other direct-bit families retain their
   previous call shapes and validation results.
7. Display positions `15` and the next bank's `00` are accepted as adjacent, while positions `16`
   through `99`, unsafe numeric representations, and invalid spans are rejected before FIFO admission
   or transport.
8. Exactly 1000 consecutive bit values, including a batch that crosses display-bank boundaries, are
   accepted as one request. A 1001-value update and every other request-limit overflow are rejected
   atomically with zero transmission.
9. User documentation, migration notes, changelog, and maintainer documentation describe the same
   logical-number batching scope, preserved input order, one-request behavior, limits, and
   compatibility impact.

### Acceptance tracking

Completion evidence recorded 2026-08-02:

- `writeNamed` uses logical bit-bank numbering only for direct `BIT` batches in `R`, `MR`, `LR`,
  and `CR`; the public API and lower-level Host Link wire encoder are unchanged.
- Deterministic high-level tests passed 45/45. The final full local CI passed 117/117 tests, npm
  audit reported 0 findings, and package construction/content validation passed.
- Diff self-review covered the public surface, validation order, FIFO admission boundary, input-order
  preservation, atomic failure, request limits, tests, documentation, and package contents. The first
  targeted run exposed an overly narrow new test error-message regular expression; that accepted test
  finding was corrected and both targeted and full verification were rerun successfully. No runtime
  self-review finding remained.
- Live PLC verification is not required for this item. The change is a deterministic pre-transport
  planner coordinate conversion; existing `writeConsecutive` framing and PLC capability behavior are
  unchanged, and exact call shape, start address, order, limits, and zero-send failures are covered by
  local tests.

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink`.
- [x] Tests added or updated for every acceptance criterion, including all four bit-bank families,
      within-bank behavior, boundary crossings, limits, duplicates, gaps, reverse order, and dtype
      isolation.
- [x] Relevant lint/static checks, unit tests, Node-RED node tests, examples, package checks,
      documentation checks, and generated-reference checks passed where applicable.
- [x] Codex self-review completed against the approved contract, actual diff, public API, validation
      order, FIFO admission, error behavior, request atomicity, tests, packaging, and cross-library
      consistency requirements.
- [x] Required live-PLC checks passed, or the absence of a live requirement has an explicit release
      disposition with recorded evidence.
- [x] Documentation, migration notes, changelog, and generated API reference agree with the
      implementation where applicable.
- [x] Final acceptance criteria verified and this item marked complete.

## PERF-001 — Minimum-request HostLink named reads

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree. This record supersedes the old Node-specific input-order
wire plan for ordinary named reads without rewriting its historical evidence.

### Implementation scope

Node HostLink `readNamed` plan compilation, compatible device grouping, segment execution, result
mapping, tests, and user documentation. Writes and other aggregate APIs are excluded.

### Target contract

All inputs are parsed and validated before FIFO admission. Compatible device groups are ordered by
their first input appearance; entries within each group are sorted by address, contiguous ranges are
merged, and protocol limits create only the necessary splits. Public results retain input-key order.
The aggregate holds one FIFO turn, stops on the first failure, publishes no partial result, and does
not claim a single PLC snapshot across multiple requests.

### Machine-verifiable acceptance criteria

1. `DM10, MR0, DM11` emits one contiguous DM request followed by one MR request.
2. Descending, overlapping compatible suffix, and split-limit vectors use ascending minimal wire
   segments without changing input-order value mapping.
3. Every invalid entry fails before FIFO admission or transport, and an execution failure publishes
   no partial object.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; grouping, descending/overlapping
  inputs, mixed entries, limit splits, FIFO, failure, and mapping coverage passed in the 113/113
  targeted run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, named-read public behavior, plan validation and order,
  minimal segment construction, FIFO state, failure atomicity, tests, packaging, and applicable
  cross-library consistency; all accepted findings were corrected and reverified.
- [x] Live PLC verification is not required for PERF-001: grouping, sorting, merging, split limits,
  FIFO admission, and result mapping are deterministic client-side planner contracts verified with
  exact frames and local fake transports; no PLC capability or wire-command contract changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-001 is complete for Node HostLink.

## PERF-002 — Reuse successful Node HostLink UDP sockets

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree. This target supersedes the historical `HL-005`
per-request endpoint policy for current runtime behavior; the completed `HL-005` evidence remains
unchanged as history.

### Implementation scope

Node HostLink UDP physical-socket lifecycle, saved IPv4 endpoint, response ownership, replacement,
close/error handling, tests, and user documentation.

### Target contract

A successful UDP socket, local endpoint, and resolved IPv4 address are reused across requests.
Timeout, cancellation, transport/protocol failure, malformed/additional response data, or a datagram
with no owning request retires that socket. The next admitted request creates one replacement using
the saved IPv4 address without DNS and never retries the failed request. The explicitly accepted
residual UDP ambiguity applies when a delayed duplicate arrives only after a later request has
already taken ownership.

### Machine-verifiable acceptance criteria

1. Sequential successful requests use the same physical socket and local endpoint.
2. Every listed abnormal condition retires the socket, and the next request uses a new socket without
   another name lookup.
3. Close destroys the retained socket and no delayed retired-socket event can settle later work.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; UDP reuse, endpoint stability,
  malformed/error replacement, idle duplicate, close, generation, and no-repeat-DNS coverage passed
  in the 113/113 targeted run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, UDP lifecycle states, response ownership, abnormal
  retirement, saved-endpoint replacement, close/error races, tests, packaging, and applicable
  cross-library consistency; all accepted findings were corrected and reverified.
- [x] Live PLC verification is not required for PERF-002: socket reuse, local-endpoint preservation,
  ownership, retirement, replacement, and DNS behavior are deterministic transport-lifecycle
  contracts verified with local UDP fixtures; no PLC capability or HostLink frame changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-002 is complete for Node HostLink.

## PERF-008B — One FIFO turn for Node HostLink named-read aggregates

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree.

### Implementation scope

Node HostLink `readNamed` compilation, aggregate queue admission, segment response staging, and final
result materialization.

### Target contract

The complete immutable plan and options are prepared before FIFO admission. One aggregate FIFO turn
covers every planned PLC request, command response validation, safe decode, and staging. The turn is
released only after the final segment is staged; pure input-order result construction then occurs
outside the turn. No other same-client request can interleave, and no partial result is published.

### Machine-verifiable acceptance criteria

1. A multi-segment named read calls `_runExclusive` exactly once and preserves segment wire order.
2. Preflight failures acquire no FIFO turn and send nothing.
3. A segment failure stops later sends and exposes no partially materialized result.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; multi-segment aggregate, single
  admission, preflight, early failure, non-interleaving, and result-order coverage passed in the
  113/113 targeted run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, plan/preflight boundary, one-turn state transitions,
  response staging, failure atomicity, post-turn materialization, tests, packaging, and applicable
  cross-library consistency; all accepted findings were corrected and reverified.
- [x] Live PLC verification is not required for PERF-008B: FIFO admission count, segment order,
  staging, non-interleaving, and partial-result suppression are deterministic client-side scheduling
  contracts verified with exact frames and local fake transports; no PLC capability changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-008B is complete for Node HostLink.

## PERF-008C — Reuse one HostLink poll plan and one FIFO turn per cycle

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree.

### Implementation scope

Node HostLink `poll` plan compilation, per-cycle aggregate admission, staging/materialization, and
interval wait placement.

### Target contract

Polling compiles and freezes the minimum-request named-read plan once before the first cycle. Every
cycle uses that same plan and one aggregate FIFO turn across all of its requests. A failed cycle
publishes no partial result and is not retried. The interval begins only after the turn is released
and is waited outside FIFO.

### Machine-verifiable acceptance criteria

1. Address validation and plan compilation occur once, not once per cycle.
2. Each successful cycle acquires one FIFO turn, produces one complete input-order result, releases
   the turn, and then waits the interval.
3. Cycle failures do not publish partial data or automatically retry a segment.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; plan reuse, per-cycle admission,
  interval placement, comment preflight, failure, and result coverage passed in the 113/113 targeted
  run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, one-time compilation, cycle state transitions,
  one-turn-per-cycle behavior, error publication, interval cancellation, tests, packaging, and
  applicable cross-library consistency; all accepted findings were corrected and reverified.
- [x] Live PLC verification is not required for PERF-008C: compilation count, FIFO turns, cycle
  staging, interval placement, and failure publication are deterministic client-side polling
  contracts verified with local fake transports; no PLC capability or frame changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-008C is complete for Node HostLink.

## PERF-010C1 — One active lifecycle AbortController

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree.

### Implementation scope

Node HostLink FIFO activation, caller-signal forwarding, `close()` cancellation, reason selection,
and listener cleanup.

### Target contract

Each active operation creates exactly one lifecycle `AbortController`. A caller-signal forwarding
listener exists only when a signal is supplied; `close()` aborts the same controller. The first
caller-cancel or close reason wins, queued cancellation retains its existing removal path, and every
active completion path removes the forwarding listener. State-changing outcome-unknown
classification remains unchanged.

### Machine-verifiable acceptance criteria

1. One active operation creates one controller and no caller listener when no signal is supplied.
2. Normal completion, error, timeout, cancel, and close remove any forwarding listener exactly once.
3. Caller-cancel/close races preserve the first reason without double settlement or cross-generation
   cancellation.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; controller count, listener cleanup,
  first-reason races, normal/error/timeout/cancel/close completion, and outcome classification passed
  in the 113/113 targeted run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, controller/listener lifecycle, queued versus active
  cancellation, first-reason selection, close races, outcome-unknown behavior, tests, packaging, and
  applicable cross-library consistency; the accepted first-abort-reason finding was corrected and
  reverified.
- [x] Live PLC verification is not required for PERF-010C1: controller allocation, signal forwarding,
  listener cleanup, reason races, and settlement are deterministic local lifecycle contracts verified
  with controlled signals and fake transports; no PLC capability or frame changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-010C1 is complete for Node HostLink.

## PERF-010C2 — Remove duplicate Node HostLink response Buffer copies

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree.

### Implementation scope

Node HostLink UDP response ownership, TCP line extraction, CR/LF stripping, raw/comment public Buffer
ownership, additional-response detection, and traffic accounting.

### Target contract

UDP makes exactly one internal ownership copy of each accepted datagram and does not copy again at
Promise completion. TCP passes an owned receive-buffer line view into decode while retaining the
microtask boundary used to detect an additional response. Buffer terminator stripping returns a
view. A public API that returns raw bytes creates one final independent caller-owned Buffer.

### Machine-verifiable acceptance criteria

1. UDP ownership performs one full copy and TCP internal decode performs no additional full line copy.
2. CR, LF, CRLF, and repeated terminators are stripped without copying Buffer input.
3. `sendRaw` and comment-byte results are isolated from transport state and other returned values.
4. Wire bytes, counters, decode values, and additional/unsolicited response retirement remain unchanged.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; UDP/TCP ownership, terminator views,
  public mutation isolation, traffic accounting, and additional-response coverage passed in the
  113/113 targeted run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, transport-to-decoder ownership, TCP microtask guard,
  terminator views, public Buffer isolation, response retirement, tests, packaging, and applicable
  cross-library consistency; accepted extra-response and mutation-isolation findings were corrected
  and reverified.
- [x] Live PLC verification is not required for PERF-010C2: Buffer copy count, ownership isolation,
  terminator stripping, traffic accounting, and extra-response handling are deterministic local
  memory/transport contracts verified with TCP/UDP fixtures; no PLC capability or frame changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-010C2 is complete for Node HostLink.

## PERF-010C3 — Parse each Node HostLink named address once

Decision status: approved on 2026-08-02; implementation and final acceptance are complete for the
Node HostLink scope in the overhaul worktree.

### Implementation scope

Node HostLink internal detailed address parser, named-read/poll plan entries, validation, segment
planning, prepared-device execution, and result mapping. Public parser helpers are unchanged.

### Target contract

Each input address is parsed once at plan compile into immutable private address, dtype, count, bit,
and device metadata. Validation, semantic duplicate detection, optimization, request generation,
execution, and decode reuse that entry without high-level reparsing. Poll reuses the same plan across
cycles. Public `parseAddress` and `normalizeAddressList` signatures and return shapes remain unchanged,
and compiled entries are not exposed for mutation.

### Machine-verifiable acceptance criteria

1. Scalar, array, COMMENT, BIT, BIT_IN_WORD, bit-bank, native/non-native DWord, mixed, and descending
   plans preserve their accepted frames, request order under PERF-001, values, and result order.
2. Invalid grammar, dtype/count/bit, span, and semantic duplicate failures remain pre-FIFO and zero-send.
3. Poll executes repeated cycles without reparsing or recompiling its address plan.
4. Public parser/normalizer vectors and return contracts remain unchanged.

### Acceptance tracking

- [x] Implementation completed in `node-red-contrib-plc-comm-kvhostlink` for the full scope above.
- [x] Tests were added or updated for every acceptance criterion; parser vectors, mixed named reads,
  prepared-device paths, invalid/duplicate preflight, poll plan reuse, and mapping coverage passed in
  the 113/113 targeted run and the 128/128 full suite.
- [x] Relevant full checks passed: no-auto-publish and profile-fixture freshness, unit/runtime tests,
  example-flow load, package/source-archive checks, `npm pack --dry-run`, and the Node-RED editor smoke
  test.
- [x] Codex self-review covered the actual diff, public parser surface, internal parse-once boundary,
  immutable entry reuse, validation order, planned execution and decode, tests, packaging, and
  applicable cross-library consistency; the accepted internal-reparse finding was corrected and
  reverified.
- [x] Live PLC verification is not required for PERF-010C3: parse counts, immutable metadata reuse,
  validation, planning, and result mapping are deterministic client-side contracts verified with
  exact parser vectors and fake transports; no PLC capability or wire behavior changed.
- [x] `CHANGELOG.md`, `README.md`, user usage and API references, locally collected docs,
  package-symbol checks, and the strict docs-site build agree with the implementation; no migration
  note is required because no public signature changed.
- [x] All numbered acceptance criteria were verified and PERF-010C3 is complete for Node HostLink.
