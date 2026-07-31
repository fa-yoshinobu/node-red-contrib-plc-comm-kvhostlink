# TODO

Current active TODOs only.

## Current Status

The nine approved implementation items are complete in the working tree. The
evidence-dependent comment-encoding decision remains open, and no
comment-decoder implementation change is authorized until `HL-EVAL-TODO-006`
is approved.

### Verification evidence — 2026-08-01

- Current-worktree CI passed 90 tests with zero skips, JavaScript syntax and
  npm package dry-run checks; the Node-RED editor import/startup smoke passed.
- The independent npm package-content guard passed with 31 files and excluded
  repository-only tests, scripts, TODOs, and maintainer material.
- The GitHub source-archive gate passed from `HEAD` with worktree attributes:
  40 files, all 6 tracked sample files, all 6 tracked test files, 79 tests,
  extracted syntax/sample JSON/test/package checks, and cleanup under `D:\APP`.
  The gate must be rerun normally after these working-tree changes are committed.
- `git diff --check` passed. All five flows were reviewed: basic/typed/array use
  manual random write plus best-effort restore; device matrix and multi-PLC
  monitor are read-only.
- Codex self-review inspected the actual diff, public API, validation order,
  transport generations, response ownership, cancellation/timeout paths,
  tests, examples, documentation, and source/npm packaging. Accepted findings
  were fixed and reverified: missing Editor `Z:F` compatibility, mixed
  read-only `AT` partial-write preflight, insufficient UDP loopback coverage,
  and npm notice handling in the source-archive gate. There are no rejected,
  duplicate, or deferred self-review findings for the nine completed items.
- Live PLC verification is not required for these deterministic local input,
  planning, parser, socket-state, editor, and packaging contracts. No PLC
  capability/profile assertion changed and no live PLC communication occurred.
- README, user guides, API reference, editor help, samples, changelog, release
  process, and migration notes agree. Comment decoding remains unchanged.

## HL-EVAL-001 — Reject Float32 writes to direct bit devices before transport

### Implementation scope

- Node-RED high-level Float32 write planning, runtime nodes, and exported helper APIs
- Every direct bit device family accepted by the address parser, including `Y`, `R`, `B`, `MR`, `LR`, `CR`, `VB`, `X`, `M`, and `L`

### Target contract

Float32 (`F`) writes are supported only for word devices. A direct bit target is rejected with `ValueError` before frame construction or transport; the implementation must not reinterpret, split, retry, or send the Float32 bit pattern as consecutive bit writes.

### Compatibility impact

Calls that previously could emit unintended multi-bit writes now fail before communication. This is an intentional safety correction; no compatibility alias or fallback is retained.

### Acceptance criteria

1. `Y0:F` and `R0:F` writes fail with `ValueError` before any client send.
2. Every supported direct bit family follows the same rejection path, while valid word-device Float32 writes retain their defined two-word encoding.
3. Runtime-node, named, direct helper, and normalized-address paths cannot bypass the validation.
4. Regression tests prove zero sends for rejected writes; live PLC writes are not required for this safety guard.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-002 — Use one exact address grammar in Node-RED editor and runtime

### Implementation scope

- High-level address parsing and normalization
- Read/write runtime nodes, dynamic message inputs, editor validation, and editor help

### Target contract

Every address must match the complete approved grammar. An address has at most one valid dtype selector or one valid bit-in-word selector; extra `:`, extra `.`, trailing data, empty selectors, conflicting selectors, and selector/device combinations not supported by runtime are rejected before connect or send. Editor and runtime use equivalent rules for read, write, normalize, and dynamic inputs.

### Compatibility impact

Inputs such as `DM100:U:COMMENT`, `DM200.3.extra`, `DM100:BIT`, and `T0:BIT` no longer appear valid or silently target a different address.

### Acceptance criteria

1. Full-string vectors cover every supported device/dtype/count/bit form and reject unconsumed characters or a second selector.
2. Read, write, normalize, runtime-node, dynamic-input, and editor validation produce the same valid/invalid result for a shared vector corpus.
3. `DM100:U:COMMENT`, `DM200.3.extra`, empty/conflicting selectors, `DM100:BIT`, and `T0:BIT` are rejected before connect or send.
4. Normalization never changes a syntactically invalid input into a different valid target.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-003 — Isolate Node-RED UDP requests by socket generation

### Implementation scope

- UDP socket lifecycle, active request state, queued operations, timers, listeners, close/error/reinitialize paths, and connection node integration

### Target contract

Every UDP socket and request belongs to a generation. Close, socket error, or reinitialization invalidates the active request and every queued request from the old generation, removes their timers/listeners, and rejects them immediately with a connection error. A new generation accepts only requests created for it; old requests are never automatically resent.

### Compatibility impact

Requests queued before a disconnect now fail instead of being transmitted through a later connection. Callers must explicitly issue new work after reconnecting.

### Acceptance criteria

1. Closing or invalidating a socket rejects its active UDP request promptly and clears all associated timers/listeners.
2. Every queued old-generation request fails before send even when reconnect completes before it reaches the queue head.
3. New-generation requests operate normally and cannot receive or complete an old request's response.
4. Reconnect does not automatically retry or resend any request.
5. Deterministic loopback tests cover close, error, reinitialize, reconnect, queue ordering, and stale response timing.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-004 — Give each Node-RED TCP request exclusive ownership of one response

### Implementation scope

- TCP receive buffering, line framing, pending-request state, send preconditions, unsolicited-data handling, and reconnect behavior

### Target contract

One request owns exactly one nonempty response. Any additional or unsolicited response is a protocol violation that invalidates the connection and is never queued for a later request. Stale response data detected before a send prevents that send and disconnects. If an extra response arrives after the earlier result was returned, the connection closes and the next request fails as not connected. Valid CR/LF framing remains supported; no request is retried automatically.

### Compatibility impact

Previously silent response reassignment becomes an explicit connection failure, preventing stale data from being returned for a different PLC command.

### Acceptance criteria

1. A response sequence such as `111\r222\r` satisfies only the owning request with `111`; `222` invalidates the connection and is never returned to a later request.
2. A send attempted with stale buffered response data performs zero writes and fails after connection invalidation.
3. Extra data arriving before, during, and immediately after request completion has deterministic ownership and error behavior.
4. Valid CR, LF, and CRLF response termination behavior remains covered without creating empty or reusable response lines.
5. No protocol violation triggers automatic reconnect, resend, or response reassignment.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-TODO-006 — Determine the Host Link device-comment encoding contract

### Implementation scope

- Node-RED `RDC` device-comment decoding and read-node/runtime APIs
- Cross-language comparison with the Python, Rust, and .NET Host Link implementations
- Shared Host Link user documentation where the resulting behavior is common

### Target state

The encoding of `RDC` device-comment response bytes is defined from direct KEYENCE Host Link evidence for every affected PLC profile. The Node-RED implementation does not infer a target contract merely from successful decoding, a general KV string-encoding statement, or existing UTF-8-first/Shift_JIS-fallback behavior.

Until the evidence is complete and the resulting target contract is explicitly approved, the comment-encoding behavior remains undecided and no implementation change is authorized.

### Compatibility impact

Undecided. The investigation must identify whether the approved result preserves the current UTF-8-first/Shift_JIS-fallback behavior, fixes one encoding, selects encoding by PLC profile, or introduces an explicit API or node setting. Any public API, configuration, default, decoding, error, or migration impact must be recorded before implementation.

### Acceptance criteria

1. Official KEYENCE communication documentation is checked for the `RDC` response encoding for KV-NANO, KV-3000/KV-5000, KV-7000/KV-8000, and KV-X500 families; evidence is recorded per profile rather than inferred across families.
2. The exact codec contract is identified, including whether “Shift_JIS” means strict Shift_JIS, Windows-31J/CP932-compatible decoding, or another defined mapping.
3. Ambiguous byte sequences that are valid under both UTF-8 and Shift_JIS are included in deterministic decoder vectors, and the expected result follows the approved evidence rather than decoder ordering.
4. If official documentation does not settle a profile, that profile remains `unverified` until an exact live-PLC evidence plan is written with the PLC/profile, endpoint, address, read intent, registered comment value, purpose, expected raw-byte evidence, and restoration requirement, then separately approved by the user with `OK` before communication.
5. A maintainer decision record defines the encoding selection mechanism, malformed-byte behavior, connection invalidation behavior, public API or node-setting impact, compatibility impact, and cross-language mapping before source implementation begins.
6. User documentation, tests, editor help, package contents, and migration notes agree with the approved contract in every affected implementation.

### Evidence and completion checklist

- [ ] Official `RDC` encoding evidence recorded for every affected PLC family/profile.
- [ ] Shift_JIS versus Windows-31J/CP932 mapping resolved for all four language runtimes.
- [ ] Ambiguous and malformed byte vectors defined with evidence-backed expected results.
- [ ] Need for live PLC verification decided; any required exact live batch is separately documented and approved.
- [ ] Target contract and compatibility impact explicitly approved by the user.
- [ ] Implementation completed in every affected repository.
- [ ] Tests added or updated for every acceptance criterion.
- [ ] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [ ] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [ ] Required live-PLC checks passed, or each unavailable check has an explicit release disposition.
- [ ] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [ ] Final acceptance criteria verified and the item marked complete.

### Current evidence boundary

The current implementations try UTF-8 first and fall back to Shift_JIS. KEYENCE material stating that KV-series strings use Shift_JIS is relevant but does not by itself establish the byte contract of every Host Link `RDC` response. It is supporting evidence only, not approval of a Shift_JIS-only implementation.

## HL-EVAL-020 — Invalidate Node-RED connections on decoder-originated protocol errors

### Implementation scope

- `_sendDecodedImmediate`, response decoders, semantic token parsers, and exact-socket generation invalidation
- Normal responses and device-comment decoding, without deciding HL-EVAL-TODO-006's encoding selection

### Target contract

A `HostLinkProtocolError` raised while decoding or semantically validating a received response invalidates the exact connection generation that supplied it. Empty, malformed, non-ASCII, malformed-token, and selected-codec decode failures follow this rule. A well-formed PLC error response `E0..E9` remains `HostLinkError` and does not by itself invalidate a healthy transport. Queued work cannot continue on the invalidated socket, and no request is retried automatically.

### Compatibility impact

Malformed responses now close the connection consistently. Well-formed PLC command errors remain distinguishable and reusable-connection behavior is preserved.

### Acceptance criteria

1. Empty, malformed-frame, non-ASCII, invalid-token, and selected-codec decode failures raise `HostLinkProtocolError` and invalidate the receiving generation.
2. A valid `E0..E9` response raises `HostLinkError` with its code and leaves the connection reusable unless another independent transport failure occurred.
3. Queued requests for an invalidated generation fail without send and are not automatically reconnected or retried.
4. Comment-decoder malformed-byte tests apply to the currently approved codec behavior without resolving the open encoding-selection decision.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-021 — Require exact Node-RED operating-mode responses

### Implementation scope

- Operating-mode confirmation through the client and runtime-node paths

### Target contract

The complete response body must be exactly `"0"` or `"1"`. Any other body, including `2`, `01`, whitespace, signs, empty text, or trailing data, is a `HostLinkProtocolError`, invalidates the connection, and is never retried or reinterpreted.

### Compatibility impact

Permissive `parseInt` behavior is removed; malformed responses such as `1-corrupt` no longer report a valid mode.

### Acceptance criteria

1. Exact `0` and `1` responses return their documented operating modes.
2. `2`, `01`, ` 1`, `+1`, `1-corrupt`, empty, and nonnumeric responses raise `HostLinkProtocolError` and invalidate the receiving connection.
3. Client and runtime-node paths do not automatically retry or reconnect.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-022 — Require safe integers for Node-RED integer-only arguments

### Implementation scope

- Every integer-only exported JavaScript API argument, including bank, expansion-unit, address, count, bit-index, and other command fields
- Node-RED configuration/editor boundaries that begin as text

### Target contract

An exported JavaScript API integer argument must have `typeof value === "number"` and satisfy `Number.isSafeInteger(value)`. Decimals, NaN, infinities, booleans, numeric strings, and implicit conversions are rejected with `ValueError` before frame generation or transport. Existing value ranges remain. Editor/configuration digit strings are strictly validated and converted once at the configuration boundary before calling the API.

### Compatibility impact

Implicitly converted inputs such as `"1"`, `true`, and `1.5` no longer enter command text. Valid Node-RED form values remain usable through explicit boundary conversion.

### Acceptance criteria

1. Every exported integer-only parameter is inventoried and applies safe-integer validation before its existing range check.
2. `switchBank(1.5)` and fractional expansion-unit arguments fail with `ValueError` and produce zero sends.
3. Representative numeric strings, booleans, NaN, infinities, unsafe integers, and out-of-range integers fail before transport.
4. Editor/runtime configuration accepts only complete decimal digit strings in range, converts them once, and passes an actual number to the public API.
5. Valid boundary safe integers retain their documented command formatting.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-023 — Preflight complete Node-RED `writeNamed` batches against protocol limits

### Implementation scope

- `writeNamed` parsing, grouping, write-plan construction, and all client sends
- Word, double-word, and timer/counter group limits

### Target contract

`writeNamed` builds and validates the complete write plan before the first send. If any resulting group exceeds its protocol point limit, the entire call fails before communication. The library does not split an oversized call automatically; applications that choose multiple calls own ordering and partial-success handling.

### Compatibility impact

Oversized calls now fail atomically at preflight instead of failing later or partially transmitting. Automatic splitting is deliberately not introduced.

### Acceptance criteria

1. Word groups above 1,000 points, double-word groups above 500 points, and timer/counter groups above 120 points reject the complete call before any send.
2. Boundary-size groups of 1,000, 500, and 120 points retain their valid command construction.
3. Preflight validates every update and every resulting group before transport, including mixed updates where only a later group is invalid.
4. Tests prove zero sends for all rejected batches and document that multiple-call partial success belongs to the application.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.

## HL-EVAL-024 — Make the GitHub source archive self-contained for standard build and test commands

### Implementation scope

- Git attributes/archive rules, Node.js tests and fixtures, `package.json` scripts, sample-flow validation, and source-archive release gate

### Target contract

The GitHub source archive includes the repository tests and all fixtures required by them. From a clean extracted archive, `npm test` and the documented standard checks complete without references to intentionally omitted files. The npm registry package remains minimal and follows its separate package-content contract.

### Compatibility impact

GitHub source archives become larger because test assets are included; the published npm package does not expand as a consequence.

### Acceptance criteria

1. An archive produced from repository HEAD contains `test/run-tests.js` and every fixture or helper it requires.
2. `npm test`, JavaScript syntax checks, sample-flow JSON validation, and documented package checks run from the extracted archive with the expected nonzero test set.
3. The release gate creates a fresh archive, extracts it, and verifies those commands without checkout-only files.
4. `npm pack` content checks independently enforce the approved minimal registry package.

### Completion checklist

- [x] Implementation completed in this repository.
- [x] Tests added or updated for every acceptance criterion.
- [x] Relevant static checks, unit tests, integration tests, examples, and package/build checks passed.
- [x] Codex self-review completed against the approved contract and cross-language consistency requirements.
- [x] Live-PLC verification is recorded as not required, or each required check has evidence or an explicit release disposition.
- [x] Documentation, migration notes, changelog, editor help, and generated API reference agree with the implementation.
- [x] Final acceptance criteria verified and the item marked complete.
