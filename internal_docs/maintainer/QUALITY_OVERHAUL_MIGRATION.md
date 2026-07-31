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

Target contract: BIT reads recognize only explicit ON/OFF or 1/0 response tokens. BIT writes accept only documented Boolean tokens. One-client bit-in-word read-modify-write is one serialized critical section. Comments remove only trailing ASCII spaces.

Compatibility impact: ambiguous BIT coercion and comment padding options are removed.

Acceptance criteria:

1. ON/1 return true, OFF/0 return false, and unknown tokens fail.
2. Concurrent bit 0/bit 1 updates on one client produce final word value 3 with request order read/write/read/write.
3. Comment padding removes ASCII space only and leaves other trailing characters intact.

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
`HL-EVAL-001`, `HL-EVAL-002`, `HL-EVAL-003`, `HL-EVAL-004`, and
`HL-EVAL-020` through `HL-EVAL-024` in `TODO.md`. This section records the
required caller migration without duplicating their acceptance history.

| Record | Required migration |
| --- | --- |
| `HL-EVAL-001` | Move Float32 values to a word device address; every direct-bit family now rejects `F` before transport. |
| `HL-EVAL-002` | Supply one complete address selector only. Remove extra selectors/trailing text, incompatible `BIT`/`F`/`COMMENT`, and counts on comment or word-bit forms. |
| `HL-EVAL-003` | Treat UDP close/failure as cancellation of that generation. Submit new work explicitly after reconnect; old queued work is not replayed. |
| `HL-EVAL-004` | Fix PLC/bridge behavior that emits unsolicited or multiple response lines. A TCP request owns exactly one non-empty line and the socket is discarded on ambiguity. |
| `HL-EVAL-020` | Reconnect after malformed decoded response bytes. PLC `E0` through `E9` errors remain command results and do not alone require reconnect. |
| `HL-EVAL-021` | Accept operating mode only from exact `0` or `1`; remove consumers that relied on numeric-prefix parsing. |
| `HL-EVAL-022` | Pass actual safe JavaScript integers to direct APIs. Node-RED form text is the only boundary that validates and converts decimal strings. |
| `HL-EVAL-023` | Keep one `writeNamed` call within 1000 word, 500 dword/Float32, and 120 timer/counter points per compiled group. Split into multiple calls only when the application explicitly accepts partial-success ordering. |
| `HL-EVAL-024` | Treat the GitHub source archive as a testable source distribution. Keep the npm package-content contract separate and minimal. |

The basic, typed, and array flows now make the optional write path explicit,
random, and best-effort restoring. The device-matrix and multi-PLC monitor flows
are read-only. No comment-decoder encoding behavior changes under this migration;
`HL-EVAL-TODO-006` remains a separate evidence-dependent decision.
