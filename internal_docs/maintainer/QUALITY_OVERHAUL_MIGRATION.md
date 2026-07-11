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

Compatibility impact: missing-field defaults, invalid-override fallback, dtype double specification, and stale owned metadata are removed.

Acceptance criteria:

1. Missing/unknown saved mode fields and output-terminal conflicts fail during node construction.
2. Present null/empty/wrong-type runtime inputs fail without executing configured fallback.
3. Editor smoke, all example JSON validation, and package inspection pass.

## Verification checklist

- [x] Implementation completed for NR-KV-OH-001 through NR-KV-OH-005 in this repository.
- [x] Tests added or updated for the machine-verifiable acceptance criteria.
- [x] `npm test` passes 58 tests with zero skip; editor smoke, all example saved-field checks, `npm pack --dry-run`, and `git diff --check` pass.
- [x] Codex self-review completed for public API, validation order, explicit connection/concurrent-connect state, timeout/TCP/UDP failure, response cap, numeric formats/ranges, compound updates, Node runtime modes, docs, examples, and package contents.
- [ ] Claude source review completed and findings recorded — pending user authorization; Claude has not been invoked.
- [ ] Codex resolved or dispositioned every Claude finding and reran affected checks — pending Claude review.
- [x] No new live-PLC result is required to distinguish these API, validation, frame-construction, and local transport-state contracts; existing hardware capability evidence is unchanged.
- [x] Documentation, migration notes, changelog, examples, and API reference agree with the final implementation.
- [ ] Final acceptance completed — pending Claude review and cross-library consistency review.

## Claude review status

Pending user authorization. Before any Claude invocation, present this repository and diff scope, the decisions above, test/package evidence, supplied review material, and expected finding format, then wait for explicit authorization for that batch.
