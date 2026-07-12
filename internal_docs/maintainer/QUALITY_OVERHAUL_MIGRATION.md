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
- [x] `npm test` passes 64 tests with zero skip, including D-116 all-source/evaluator boundaries,
  D-118 fixed output shapes, D-119 metadata ownership/operation transitions, D-120 exact error
  routing/output counts, D-123 authoritative runtime-property/no-fallback boundaries, and D-125
  exact-one writable dtype/no-send boundaries, and D-126 all-node display-name/identity/request
  invariance; editor
  smoke, all example saved-field checks, `npm pack --dry-run`, and
  `git diff --check` pass.
- [x] Codex self-review completed for public API, validation order, explicit connection/concurrent-connect state, timeout/TCP/UDP failure, response cap, numeric formats/ranges, compound updates, Node runtime modes, docs, examples, and package contents.
- [ ] Claude source review completed and findings recorded — pending user authorization; Claude has not been invoked.
- [ ] Codex resolved or dispositioned every Claude finding and reran affected checks — pending Claude review.
- [x] No new live-PLC result is required to distinguish these API, validation, frame-construction, and local transport-state contracts; existing hardware capability evidence is unchanged.
- [x] Documentation, migration notes, changelog, examples, and API reference agree with the final implementation.
- [ ] Final acceptance completed — pending Claude review and cross-library consistency review.

## Claude review status

Pending user authorization. Before any Claude invocation, present this repository and diff scope, the decisions above, test/package evidence, supplied review material, and expected finding format, then wait for explicit authorization for that batch.
