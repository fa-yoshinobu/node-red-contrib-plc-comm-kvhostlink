# Node-RED KV HostLink Quality Overhaul

This maintainer record preserves the approved target contracts, breaking-change scope, acceptance criteria, and verification evidence. User documentation contains only the resulting supported behavior.

## NR-KV-OH-001 — Explicit endpoint and lifecycle

Scope: `HostLinkClient`, `openAndConnect`, and `kvhostlink-connection`.

Target contract: port and transport are explicit; timeout omission means 3000 ms; PLC profile is explicit. Construction performs no network I/O. Commands after construction, close, timeout, or transport failure require an explicit successful `connect()`.

Compatibility impact: implicit port/transport and command-triggered lazy connection are removed.

Acceptance criteria:

1. Missing, blank, fractional, non-finite, or out-of-range endpoint values fail before socket creation.
2. An unconnected command performs no transport operation and returns a connection error.
3. The Node-RED connection node explicitly connects before read/write execution; saved editor examples contain the required fields.

## NR-KV-OH-002 — Stable transport and diagnostic boundaries

Scope: raw response handling, receive limits, trace hooks, and timeout/failure state.

Target contract: raw command responses are undecoded body bytes without CR/LF. Semantic commands privately decode and classify PLC errors. Buffer sizing is internal with an absolute cap. Trace is maintainer-only and disabled by default. Timeout/failure invalidates transport state.

Compatibility impact: decoded `sendRaw`, custom decoder, `bufferSize`, and public `traceHook` are removed.

Acceptance criteria:

1. Raw ASCII, PLC error, and non-ASCII bodies are preserved as bytes; semantic operations alone decode and raise PLC errors.
2. Public buffer/trace options fail instead of being ignored; cap errors discard partial state.
3. Concurrent commands remain serialized and a failed transport is not recreated by the next command.

## NR-KV-OH-003 — Explicit device and data-format identity

Scope: low-level numeric read/write, consecutive/set-value/monitor-word operations, and expansion-unit buffer access.

Target contract: low-level numeric access uses a base device plus a separate required `.U/.S/.D/.L/.H` format. A suffix-bearing device is rejected. Bare direct-bit access retains bit semantics. Expansion-unit access always requires a format.

Compatibility impact: suffix-bearing low-level devices, format omission, options-object format arguments, and implicit `.U` are removed.

Acceptance criteria:

1. Missing/empty format and `DM100.D`-style low-level inputs issue zero requests.
2. Five numeric formats produce the exact expected command, width, count, and address-span behavior.
3. Numeric writes reject coercion, fractions, non-finite values, overflow, underflow, and truncation before send; typed responses reject format-incompatible tokens.

## NR-KV-OH-004 — Typed values and compound update safety

Scope: typed BIT reads/writes, bit-in-word updates, and comment normalization.

Target contract: BIT reads recognize only explicit ON/OFF or 1/0 response tokens. Direct-bit writes accept only JavaScript Booleans. The public bit-in-word read-modify-write helper is removed because it cannot be atomic against PLC logic or another connection. Comments remove only trailing ASCII spaces.

Compatibility impact: ambiguous BIT coercion and comment padding options are removed.

Acceptance criteria:

1. ON/1 return true, OFF/0 return false, and unknown response tokens fail.
2. Direct-bit writes accept only `true`/`false`; numbers and strings fail before send.
3. `writeBitInWord` is absent from the public API and bit-in-word named writes fail before transport.
4. Comment padding removes ASCII space only and leaves other trailing characters intact.

## NR-KV-OH-005 — Explicit Node-RED saved-flow contract

Scope: connection/read/write editor fields, runtime overrides, output shape, metadata ownership, and examples.

Target contract: saved source types and output/metadata/error modes are required exact values. Invalid present runtime overrides never fall back. Scalar output requires one address. Single-write dtype is specified exactly once. Owned metadata is replaced for the current operation.

Approved decision mapping: D-116 applies the exact `str`/`msg`/`flow`/`global`/`env` source-type
contract to HostLink read/write nodes, D-118 fixes read `object`/`array`/`value` payload shapes, and
D-119 fixes metadata ownership and current-operation identity. D-120 fixes error routing and its
derived terminal count. D-123 makes every present runtime property authoritative and rejects
invalid, conflicting, or isolated fields instead of executing configured operations. D-125 requires
single-write dtype to come from exactly one complete source and excludes read-only `COMMENT`.
D-126 separates optional display names from every runtime identity and communication field. Editor defaults
initialize new nodes only and do not repair missing fields in old flows.

Compatibility impact: missing-field defaults, invalid-override fallback, dtype double specification, and stale owned metadata are removed.

Acceptance criteria:

1. Missing/unknown saved mode fields and output-terminal conflicts fail during node construction.
2. Present null/empty/wrong-type runtime inputs, conflicting `msg.updates`/`msg.address`, and isolated
   `msg.value`/`msg.dtype` fail before connect/read/write without executing configured fallback.
3. Every non-literal source is evaluated through Node-RED. Missing references, evaluation errors,
   and an unavailable evaluator fail before connect/read/write and never become literal addresses or
   updates.
4. Object mode is always address-keyed, array mode is always an array, and value mode accepts
   exactly one address. Zero/multiple addresses fail before connect/read without sending output.
5. Full/minimal metadata removes all stale owned fields, preserves custom fields, and identifies the
   current read/write operation. Full alone includes connection plus current addresses or updates;
   off preserves the existing metadata object unchanged and does not assert it is current.
6. Error mode is exactly throw/msg/output2 with success on output 1 and failures routed only to
   done(error)/output 1/output 2 respectively. Terminal count is derived as 1/1/2; a present saved
   value must be the exact integer and may not be a coercible string/Boolean or conflicting count.
7. Editor smoke, all example JSON validation, and package inspection pass.
8. Single-write dtype is specified exactly once. A complete address dtype/count or word-bit selector
   permits `msg.dtype` omission; a bare address requires exact uppercase `BIT/U/S/D/L/F/H`.
   `COMMENT`, double specification, missing dtype, explicit undefined/null/empty/non-string,
   lowercase/alias/unknown values, and incomplete/conflicting colon or period selectors fail before
   connect/write with no fallback or complementary parsing.
9. Connection/read/write `name` is optional display-only state. Missing/null/blank/non-string values
   normalize to empty, normal strings are trimmed, and duplicates are allowed. Changing a name does
   not change the runtime node ID, connection reference, profile, request arguments, request content,
   output metadata, or editor fallback label behavior.

## Verification checklist

- [x] Implementation completed for NR-KV-OH-001 through NR-KV-OH-005 in this repository.
- [x] Tests added or updated for the machine-verifiable acceptance criteria.
- [x] `npm test` passes 69 tests with zero skip, including D-116 all-source/evaluator boundaries,
  D-118 fixed output shapes, D-119 metadata ownership/operation transitions, D-120 exact error
  routing/output counts, D-123 authoritative runtime-property/no-fallback boundaries, and D-125
  exact-one writable dtype/no-send boundaries, and D-126 all-node display-name/identity/request
  invariance; editor
  smoke, all example saved-field checks, `npm pack --dry-run`, and
  `git diff --check` pass.
- [x] Codex self-review completed for public API, validation order, explicit connection/concurrent-connect state, timeout/TCP/UDP failure, response cap, numeric formats/ranges, compound updates, Node runtime modes, docs, examples, and package contents.
- [x] Claude source review completed and findings recorded in the workspace review result; the user ran the authorized batch outside Codex.
- [x] Codex resolved or dispositioned every Node.js/Node-RED finding and reran affected checks.
- [x] No new live-PLC result is required to distinguish these API, validation, frame-construction, and local transport-state contracts; existing hardware capability evidence is unchanged.
- [x] Documentation, migration notes, changelog, examples, and API reference agree with the final implementation.
- [x] Repository-level final acceptance completed; HostLink family-level acceptance is recorded separately.

## Claude review status

The user separately ran the authorized HostLink review batch on 2026-07-12.
Its result is preserved in the workspace review record and is dispositioned
below. Codex did not invoke Claude.

## NR-KV-CLAUDE-20260712 — Independent-review corrections

Scope: Claude HostLink review findings 1, 2, 9, 10, 14, 15, 16, 20, and 21
that affect this Node.js/Node-RED repository.

Target contract: numeric writes are strict and never coerce or wrap; a named
write is compiled completely before transport; UDP requires a response
terminator and invalidates failed transport; JavaScript `Date` clock values use
years 2000 through 2099; address parsing consumes the complete input; editor
validation reads only the active node's DOM state. Cross-implementation vectors
are owned by the separate cross-verification repository, not copied into this
library.

Compatibility impact: coercible numeric inputs, unterminated UDP datagrams,
partially valid named-write objects, address-list garbage, and Date years
outside 2000 through 2099 are rejected before they can be treated as valid.

Acceptance criteria:

1. Every scalar and array write rejects coercion, fractional integer values,
   range overflow, and Float32 encoding overflow before the first request.
2. Empty named operations reject, and an invalid later entry in `writeNamed`
   proves that zero earlier writes were sent.
3. An unterminated UDP response fails, closes the socket generation, and a
   terminated response remains accepted.
4. Address-list parsing rejects any unconsumed characters, and editor source
   validation is invariant under another node being open in the editor.
5. User documentation, changelog, tests, and package contents describe only the
   corrected contract; no library-local cross-implementation vector remains.
6. RD, RDS, URD, and monitor responses have exact command-derived token counts;
   direct-bit responses are only `0`/`1`/`ON`/`OFF`, and malformed shapes discard the
   session before another request.

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Full static, unit, editor, example, and package checks passed (`release_check.bat`, 69 tests, zero skip).
- [x] Codex self-review completed against the approved contract, validation order, transport invalidation, public API, editor state, docs, and package contents.
- [x] Claude source review completed; findings are recorded in the workspace review result.
- [x] Codex dispositioned the Node.js/Node-RED findings and reran all affected checks.
- [x] No additional live-PLC check is required for these local validation and transport-boundary corrections.
- [x] Documentation and migration notes agree with the implementation.
- [x] Final acceptance criteria verified for this repository; family-level HostLink acceptance remains separate.

## 2026-07-12 KV-X500 live smoke evidence

- [x] The package public HostLink client and typed-read helper connected to `keyence:kv-x500` at `192.168.250.100:8501` over TCP and read `DM0:U` once; the result was `5878`.
- [x] No write, retry, or profile／transport fallback was performed.
- [x] This evidence is limited to that endpoint, profile, device, transport, and operation; it does not verify other device families, Node-RED editor/runtime wiring, or the complete profile.

## NR-007: Lifetime traffic statistics

Approved next-release contract: `trafficStats()` returns frozen lifetime counters; only complete
sends and complete response lines/datagrams count, pre-send and partial failures do not, and
close/reconnect does not reset. Implementation and deterministic tests are required; live PLC
verification is unnecessary. Final packaging and publication acceptance completed with `v3.2.0`.

- [x] Public API and transport-boundary implementation completed.
- [x] Deterministic tests, documentation, changelog, and package gate completed.
- [x] Codex final self-review completed.
- [x] Next-release package acceptance completed. Evidence: the `v3.2.0` tag equals repository HEAD,
  the GitHub Release and npm `@fa_yoshinobu/node-red-contrib-plc-comm-kvhostlink` `3.2.0` package are
  public, tag-commit checks passed, and the final six-runtime family source/API comparison was
  completed on 2026-07-18.

## QREV-20260714-004: Segmentation-independent TCP receive accounting

Scope: runtime TCP receive framing and `trafficStats().rxBytes`.

Family equivalence: all four HostLink implementations count TCP `OK\r`, `OK\n`, coalesced `OK\r\n`, and either split CR/LF ordering as 3 bytes; UDP `OK\r\n` remains 4 bytes. Incomplete oversize/EOF/timeout/cancellation data contributes zero, while a complete PLC error line is counted before semantic decoding. The family comparison is preserved in the archived workspace record `communication_library_quality_review_20260714.md`.

Target contract: one completed TCP response counts its body through the first CR or LF. Additional
CR/LF separator bytes are consumed without changing the counter, whether they arrive together or
in a later TCP data event. UDP continues to count the complete accepted response datagram.

Compatibility impact: a coalesced CRLF response previously could count both terminators and now
counts only the first; split CRLF already counted one. The corrected value is independent of TCP chunking.

Acceptance criteria:

1. Equivalent CRLF responses produce the same `rxBytes` when CR and LF are coalesced or split.
2. The separator left after a completed line cannot become an empty or misassociated next response.
3. Complete PLC errors are counted; incomplete oversize, EOF, and timeout paths are not counted. Complete UDP datagram accounting is unchanged.

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Profile drift, 71 unit/editor tests, examples, documentation, and package dry-run checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Claude source review completed; findings are preserved in the archived workspace record `claude_review_findings_20260714.md`.
- [x] Codex resolved or dispositioned every applicable Claude finding and reran affected checks.
- [x] Live PLC verification is not required for this deterministic local framing and counter contract.
- [x] Documentation, migration notes, changelog, and API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## 2026-08-01 Host Link evaluation migration

The approved GOAL records and machine-verifiable acceptance criteria are
`HL-EVAL-001`, `HL-EVAL-002`, `HL-EVAL-003`, `HL-EVAL-004`,
`HL-EVAL-TODO-006`, and `HL-EVAL-020` through `HL-EVAL-024` in `TODO.md`. This section records the
required caller migration without duplicating their acceptance history.

| Record | Required migration |
| --- | --- |
| `HL-EVAL-001` | Move Float32 values to a word device address; every direct-bit family now rejects `F` before transport. |
| `HL-EVAL-002` | Supply one complete address selector only. Remove extra selectors/trailing text, incompatible `BIT`/`F`/`COMMENT`, and counts on comment or word-bit forms. |
| `HL-EVAL-003` | Treat UDP close/failure as cancellation of that generation. Submit new work explicitly after reconnect; old queued work is not replayed. |
| `HL-EVAL-004` | Fix PLC/bridge behavior that emits unsolicited or multiple response lines. A TCP request owns exactly one non-empty line and the socket is discarded on ambiguity. |
| `HL-EVAL-TODO-006` | Choose exact `utf8` or `cp932` for RDC text, or use raw bytes. Remove heuristic/profile decoding and all Shift_JIS/Windows-31J aliases; `cp932` is the Windows-31J-compatible KEYENCE Shift_JIS selection. |
| `HL-EVAL-020` | Reconnect after malformed decoded response bytes. PLC `E0` through `E9` errors remain command results and do not alone require reconnect. |
| `HL-EVAL-021` | Accept operating mode only from exact `0` or `1`; remove consumers that relied on numeric-prefix parsing. |
| `HL-EVAL-022` | Pass actual safe JavaScript integers to direct APIs. Node-RED form text is the only boundary that validates and converts decimal strings. |
| `HL-EVAL-023` | Keep one `writeNamed` call representable as exactly one request within 1000 word, 500 dword/Float32, or 120 timer/counter points. Submit separate calls only when the application explicitly owns partial-success and outcome-unknown handling. |
| `HL-EVAL-024` | Treat the GitHub source archive as a testable source distribution. Keep the npm package-content contract separate and minimal. |

The basic, typed, and array flows now make the optional write path explicit,
random, and best-effort restoring. The device-matrix and multi-PLC monitor flows
are read-only. RDC comment migration is governed separately by
`HL-EVAL-TODO-006`.

## HL-EVAL-TODO-006 — Explicit RDC text codec or raw bytes

Implementation scope: protocol comment decoding, `HostLinkClient`, high-level
comment/named/poll helpers, Node-RED read runtime/editor, package surface, and
user documentation.

Target contract: RDC response bodies remain exact bytes until the caller chooses
text. Public text accepts only exact `utf8` or `cp932`; `cp932` is the
Windows-31J-compatible codec commonly described by KEYENCE as Shift_JIS. No
automatic, profile-selected, fallback, replacement, alias, or separate strict
Shift_JIS mode exists. Raw APIs and Node output return an exact body `Buffer`
without CR/LF, including trailing spaces.

Compatibility impact: `decodeCommentResponse`, low/high-level `readComments`,
named reads, polling, and `:COMMENT` read nodes that previously decoded without
an explicit choice must select text plus codec or raw Buffer. Invalid/malformed
selection or bytes fail; decoder protocol failure retires the supplying
connection generation.

Machine-verifiable acceptance criteria:

1. Every public text path rejects omission, alias, automatic/profile selection,
   and contradictory raw-plus-codec options before FIFO admission/send.
2. `decodeCommentBytes`, `readCommentBytes`, and Node Buffer mode preserve the
   exact RDC body bytes, including padding, while excluding CR/LF framing.
3. The ambiguous bytes `C2 A2` decode only as UTF-8 `¢` or CP932 `ﾂ｢` according
   to selection; malformed vectors fail fatally with no replacement/fallback.
   UTF-8 `EF BB BF 41` retains the BOM as `U+FEFF A`; selecting CP932 for those
   bytes follows CP932 and fails rather than applying Unicode BOM handling.
   CP932 `1A`, `1C`, and `7F` preserve identical ASCII code points; invalid
   single bytes, malformed/unassigned pairs, and extension pairs `87 90`,
   `ED 40`, and `FA 4A` have strict deterministic outcomes.
4. Node 18/24 use WHATWG `shift_jis` internally for the documented
   Windows-31J/CP932 target; no separate Shift_JIS public selection is exposed.
5. Runtime, editor/help, tests, API reference, changelog, dependency lockfile,
   npm package, and extracted source agree.

- [x] Implementation completed in this repository.
- [x] Tests cover every acceptance criterion and pass.
- [x] Static, editor, package, and extracted-source checks pass.
- [x] Codex actual-diff/public-API self-review passes.
- [x] Live PLC verification is not required; the explicit-selection contract already has approved evidence and decoding is deterministic.
- [x] Documentation, migration notes, changelog, dependency metadata, and API reference agree.
- [x] Final acceptance criteria verified for this repository; other runtimes remain independently tracked by the family record.

Verification evidence: current Node.js 24 and explicit Node.js 18.20.8 each
passed 107 tests with zero skips. `run_ci.bat`, editor import/startup smoke, the
27-file/5-flow isolated npm consumer gate, and the 57-file extracted source
archive gate passed. The source archive retained all 6 samples and all 6 test
files. `git diff --check` passed, the public export list matches
`API_REFERENCE.md`, and no live PLC communication was performed for this
implementation.

Codex self-review accepted and corrected five findings: raw `E0`-through-`E9`
responses now remain `HostLinkError` values with string `code`/`response`
fields; the packed consumer smoke now exercises both text codecs, exact raw
bytes, malformed CP932, and the new public APIs; and `poll` plus low-level
invalid-codec pre-send behavior now have explicit tests. Cross-runtime review
also found that Node's `TextDecoder` stripped a leading BOM by default;
`ignoreBOM: true` now preserves it as payload data, with deterministic UTF-8
preservation and CP932 rejection vectors in unit and packed-consumer checks.
The same review found WHATWG Shift_JIS remapping CP932 ASCII controls `1A`,
`1C`, and `7F`; CP932 decoding now handles exact ASCII code points itself and
uses the fatal Shift_JIS decoder only for half-width and valid double-byte code
units. Invalid single bytes, malformed/unassigned pairs, and three Windows-31J
extension pairs are covered in unit and packed-consumer checks. No rejected,
duplicate, or deferred finding remains for this repository.

## GOAL-SERIAL-DEFER-001 — Complete single-request capacity

Implementation scope: every public request builder and `HostLinkClient` send
path in this repository.

Target contract: one framed request, including its CR terminator, is at most
65,536 bytes. The exact maximum is accepted. Maximum plus one fails before
traffic counters, connection generation, request state, trace, or transport can
change. No single-request API splits or retries.

Compatibility impact: oversized raw/custom requests that could previously be
constructed are rejected deterministically before transport.

Machine-verifiable acceptance criteria:

1. An exact 65,536-byte complete frame is built and sent as one request.
2. A 65,537-byte complete frame fails before request count, bytes, connection,
   or fake-transport send state changes.
3. Public API documentation classifies single-request and aggregate operations.

- [x] Implementation completed in this repository.
- [x] Tests cover every acceptance criterion and pass.
- [x] Static, unit, package, and extracted-source checks pass.
- [x] Codex diff/API self-review passes.
- [x] Live PLC verification is not required; the boundary is locally deterministic.
- [x] Documentation, migration notes, changelog, and API reference agree.
- [x] Final acceptance criteria verified.

## GOAL-SERIAL-DEFER-002 — One absolute transaction deadline

Implementation scope: TCP/UDP connection and command paths, including send,
framing/receive, decode, cancellation, close, and generation retirement.

Target contract: immediately before the first transport send attempt, the
active operation creates one monotonic deadline covering send completion,
response framing/receive, and decode. Progress cannot restart it. Timeout and
active cancellation retire the exact transport generation. Reuse requires an
explicit reconnect; no command is retried.

Compatibility impact: phase-by-phase or trickle-extended waits end at the one
configured deadline, and a timed-out/canceled active connection is not reusable.

Machine-verifiable acceptance criteria:

1. Stalled/partial send, response trickle, and delayed decode cannot exceed one
   transaction deadline.
2. Timeout is `HostLinkTimeoutError`; cancellation is distinct.
3. Delayed bytes/callbacks from a retired generation cannot satisfy later work.

- [x] Implementation completed in this repository.
- [x] Tests cover every acceptance criterion and pass.
- [x] Static, unit, package, and extracted-source checks pass.
- [x] Codex diff/API self-review passes.
- [x] Live PLC verification is not required; deterministic fake/loopback transport is sufficient.
- [x] Documentation, migration notes, changelog, and API reference agree.
- [x] Final acceptance criteria verified.

## GOAL-SERIAL-DEFER-006 — Ordinary-client FIFO admission

Implementation scope: `HostLinkClient`, `openAndConnect`, high-level helpers,
and Node-RED connection/read/write use of that ordinary client.

Target contract: each client admits concurrent calls into one FIFO and has at
most one active wire transaction. Complete input and effective endpoint/profile
state are validated and snapshotted at admission. Waiting cancellation sends
nothing, its timeout starts only on activation, and close rejects active plus
waiting work without later-generation leakage. Separate clients are independent.
There is no public `QueuedKvHostLinkClient` wrapper or compatibility alias.

Compatibility impact: callers use the ordinary client directly and must not
mutate inputs expecting queued operations to observe later values.

Machine-verifiable acceptance criteria:

1. FIFO order survives success and PLC error with zero overlapping sends.
2. Admission snapshots cannot be changed through caller mutation.
3. Waiting cancellation sends nothing; close rejects active/waiting work.
4. Public exports/docs contain no queued wrapper and separate clients progress independently.

- [x] Implementation completed in this repository.
- [x] Tests cover every acceptance criterion and pass.
- [x] Static, unit, package, and extracted-source checks pass.
- [x] Codex diff/API self-review passes.
- [x] Live PLC verification is not required; FIFO and lifecycle state are locally deterministic.
- [x] Documentation, migration notes, changelog, and API reference agree.
- [x] Final acceptance criteria verified.

## GOAL-ERROR-DEFER-001 — Machine-readable timeout and outcome unknown

Implementation scope: validation, connect, TCP/UDP transaction, cancellation,
close, protocol/PLC response, and state-changing post-send failure paths.

Target contract: timeout, cancellation, close, not-connected, transport,
protocol, PLC error, and state-changing outcome unknown are distinguishable by
public type/code. A state-changing request that may have been sent reports
`HostLinkOperationOutcomeUnknownError` with structured `reason` and `cause`.
Native failures remain causes. No ambiguous change is auto-retried.

Compatibility impact: code matching generic connection errors or message text
must use the dedicated public error types and must reconcile outcome-unknown
state before deciding whether to issue another write.

Machine-verifiable acceptance criteria:

1. Every classification is distinguishable without message matching.
2. Read timeout remains timeout; post-send write timeout/cancel/close/invalid
   response is outcome unknown with the originating reason/cause.
3. The affected generation retires and no request is resent.

- [x] Implementation completed in this repository.
- [x] Tests cover every acceptance criterion and pass.
- [x] Static, unit, package, and extracted-source checks pass.
- [x] Codex diff/API self-review passes.
- [x] Live PLC verification is not required; classification boundaries use deterministic transports.
- [x] Documentation, migration notes, changelog, and API reference agree.
- [x] Final acceptance criteria verified.

## GOAL-AGGREGATE-DEFER-001 — Read-only splitting only

Implementation scope: `readNamed`, `poll`, `writeNamed`, Node-RED named reads
and writes, and their compiled plan/result mapping.

Target contract: a named read validates/snapshots its full plan, preserves input
order as wire order, occupies one FIFO turn, and may split only between complete
declared entries. It stops on first failure and returns no partial value. A
multi-request read is explicitly non-atomic. A named write is accepted only if
the complete validated plan fits one request; every multi-request or
read-modify-write state change fails before transport.

Compatibility impact: run-order sorting is removed. Multi-request writes and
bit-in-word writes must become explicit application operations with deliberate
partial-success and outcome-unknown handling.

Machine-verifiable acceptance criteria:

1. Invalid later entries cause zero sends; caller mutation cannot change an admitted plan.
2. Descending/discontiguous input retains declared wire order with no sort.
3. Splits occur only before a complete input entry; dword/float/array/coherence units are not torn.
4. Later operations cannot interleave; first failure exposes no partial return.
5. A write requiring two requests fails before connect/send; one-request writes emit exactly one request.

- [x] Implementation completed in this repository.
- [x] Tests cover every acceptance criterion and pass.
- [x] Static, unit, package, and extracted-source checks pass.
- [x] Codex diff/API self-review passes.
- [x] Live PLC verification is not required; planning/order/send boundaries are locally deterministic.
- [x] Documentation, migration notes, changelog, and API reference agree.
- [x] Final acceptance criteria verified.

Verification evidence for these five records: `run_ci.bat`, the independent npm
package-content guard, and the current-worktree extracted source-archive gate
passed; the source archive contained 56 files, 6 sample files, and 6 test files.
The normal runtime and explicit Node.js 18 run each passed 104 tests with zero
skip. `git diff --check` passed. The public export list was compared with
`API_REFERENCE.md`, and source review covered API/input snapshots, validation
order, FIFO/lifecycle state, TCP/UDP/DNS generation retirement, error causes,
aggregate ordering/boundaries, Node-RED pre-connect validation, docs, npm
contents, and source contents. No live PLC communication is required for these
locally deterministic contracts.

## Accepted self-review finding — packed npm consumer boundary

The earlier package-content guard inspected `npm pack --dry-run` output but then
imported the checkout and parsed checkout example files. That did not prove the
generated tarball was consumable. The guard now creates the real tarball,
installs it into an isolated consumer directory, imports the scoped package from
that installation, and parses the example flows installed from the tarball.

The first final archive rerun also exposed that the worktree-attribute mode still
archived the `HEAD` tree, so uncommitted changes and new validation files were
not actually under test. This finding was accepted. That mode now builds a
synthetic archive from the complete non-ignored current worktree and handles
deletions before extracting and running the checks. The corrected archive gate
passed with 104 tests and the package consumer gate passed from its tarball.

## GOAL-NODE-EDITOR-SMOKE-001 — Required package-installed Editor smoke

Implementation scope: the normal GitHub Actions CI workflow and the
repository-only Node-RED Editor smoke runner.

Target contract: one dedicated representative Linux/Node job installs an
explicit Node-RED version, supplies its exact executable through
`NODE_RED_CMD`, packs this repository, installs the tarball into an isolated
Node-RED user directory, starts the editor, imports and reads back the
maintained example, and proves registration of the connection, read, and write
node types. The consumer package manifest gains no test or smoke script.

Compatibility impact: none. This is a stricter CI and packaging acceptance
gate without a runtime or package-manifest API change.

Machine-verifiable acceptance criteria:

1. Normal CI contains one independent Ubuntu/Node 20 Editor smoke job pinned to
   Node-RED 4.1.11.
2. The job passes the exact existing `red.js` path through `NODE_RED_CMD`;
   an invalid explicit path fails instead of falling back to a global command.
3. The runner creates the npm tarball, installs it into an isolated user
   directory, imports and reads back `kvhostlink-basic-read-write.json`, and finds
   `kvhostlink-connection`, `kvhostlink-read`, and `kvhostlink-write`.
4. `package.json` contains no `test`, `check`, or Editor-smoke script.

- [x] Implementation completed in this repository.
- [x] Tests use the repository-only runner and the package-installed artifact.
- [x] Relevant local static, unit, Editor-smoke, package, and source-archive gates passed for the final source state.
- [x] The equivalent local Windows/Node 24 Editor smoke passed with Node-RED 4.1.11 and the exact configured `red.js`.
- [ ] The GitHub-hosted Ubuntu/Node 20 Editor-smoke job passed for the final source state.
- [x] Codex self-review completed against the approved CI/package boundary.
- [x] Live PLC verification is not required for package installation and editor registration.
- [x] Changelog and maintainer documentation agree with the implementation.
- [ ] Final acceptance criteria verified and the item marked complete.

Verification evidence collected before the consolidated final gate:

- The direct 109-test suite passed.
- The package-installed Editor smoke passed with Node-RED 4.1.11 and the exact
  `red.js` path supplied through `NODE_RED_CMD`.
- On Windows with Node 24.14.1 and PowerShell 7.6.3, the 27-file/5-flow npm
  package and isolated consumer passed. The synthetic current-worktree source
  archive contained 57 files, 6 sample files, and 6 test files and passed its
  extracted syntax, unit, JSON-flow, and package dry-run checks.
- GitHub-hosted Ubuntu/Node 20 Editor evidence remains unchecked. The Ubuntu
  Node 18/20/22 matrix and Windows/Node 20 job were not reproduced because
  those hosted OS/runtime combinations were unavailable locally.

Self-review disposition:

- Accepted: an explicit but missing `NODE_RED_CMD` previously fell back to a
  global executable, so the smoke could pass without using the CI-selected
  runtime. An explicit invalid path now fails immediately.
- Rejected: adding an npm manifest smoke script would duplicate the
  repository-only runner in a consumer artifact and conflicts with the
  approved package boundary.
- No duplicate or deferred finding remains for this item.

## GOAL-NODE-STATUS-DOC-001 — Exact node status and diagnosis contract

Implementation scope: connection/read/write runtime status tests and the
Node-RED usage guide collected by `plc-comm-docs-site`.

Target contract: stable lifecycle, operation, count, and control status values
match the runtime exactly. A failure is a red ring containing the actual
`error.message`; diagnosis uses the selected Node-RED error route and
structured Error type/fields. Timeout and operation-outcome-unknown
classifications are not fixed status strings.

Compatibility impact: none. Existing runtime values are locked by tests and
documented without inventing new status values.

Machine-verifiable acceptance criteria:

1. Connection status tests cover `ready`, `connecting`, `connected`,
   `disconnecting`, `disconnected`, `reinitializing`, and `closed`
   with exact fill and shape.
2. Read/write tests cover `reading`, `writing`, successful `N item(s)`,
   all three control-action transitions, and dynamic red-ring error text.
3. Error-route tests retain the Error object and its structured classification.
4. The source usage guide and generated docs-site copy contain one matching
   status table and direct diagnosis to the selected error route.
5. Outcome-unknown writes are not described as retryable and local validation
   is not described as PLC evidence.

- [x] Implementation completed in this repository.
- [x] Tests cover every local status and error-route acceptance criterion.
- [x] Relevant local static, unit, package, source-archive, and docs checks passed for the final source state.
- [x] The equivalent local Windows/Node 24 status contract and package/source gates passed.
- [ ] The GitHub-hosted Ubuntu Node 18/20/22 matrix and Windows/Node 20 job passed for the final source state.
- [x] Codex self-review completed against runtime values, tests, docs, and cross-library consistency.
- [x] Live PLC verification is not required; status transitions and routing are deterministic runtime behavior.
- [x] Usage guide, generated site copy, changelog, and maintainer record agree.
- [ ] Final acceptance criteria verified and the item marked complete.

Verification and self-review disposition:

- The local Windows/Node 24.14.1 run passed all 109 tests, the 27-file/5-flow
  isolated npm consumer, the Node-RED 4.1.11 Editor smoke, and the 57-file
  current-worktree source archive retaining all 6 samples and 6 test files.
- Runtime source, exact-status assertions, and both Node-RED source usage guides
  were compared field by field. The generated docs-site paths are ignored
  build output by design; their local copies contain the same status contract
  and deployment recollects the tracked source guide.
- Accepted: HostLink had no exact lifecycle or operation-status test. The
  runtime mock now records status calls and verifies every stable value.
- Accepted: the failure-route test now uses the actual `HostLinkError` type
  and preserves its `code` while the red ring displays its real message.
- No rejected, duplicate, or deferred finding remains for this item.
