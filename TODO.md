# TODO

Current active TODOs only.

## Current Status

The nine evaluation items and the five approved cross-library protocol items
are complete in the working tree. The Node.js/Node-RED part of
`HL-EVAL-TODO-006` is also implemented and verified in the working tree; the
other affected runtime repositories remain independently tracked.

### Verification evidence — 2026-08-01

- Current-worktree CI and the explicit Node.js 18 run passed 107 tests with zero skips, JavaScript syntax and
  npm package dry-run checks; the Node-RED editor import/startup smoke passed.
- The independent npm package-content guard passed with 27 files and excluded
  repository-only tests, scripts, TODOs, and maintainer material.
- The GitHub source-archive gate passed from the current worktree tree with worktree attributes:
  57 files, all 6 tracked sample files, all 6 tracked test files, 107 tests,
  extracted syntax/sample JSON/test/package checks, and cleanup under `D:\APP`.
  The gate must be rerun normally after these working-tree changes are committed.
- `git diff --check` passed. All five flows were reviewed: basic/typed/array use
  manual random write plus best-effort restore; device matrix and multi-PLC
  monitor are read-only.
- Codex self-review inspected the actual diff, public API, validation order,
  transport generations, FIFO admission/input snapshots, absolute deadline,
  response ownership, cancellation/timeout/close and outcome-unknown paths,
  tests, examples, documentation, and source/npm packaging. Accepted findings
  were fixed and reverified: missing Editor `Z:F` compatibility, mixed
  read-only `AT` partial-write preflight, insufficient UDP loopback coverage,
  npm notice handling in the source-archive gate, DNS cancellation cleanup,
  close during DNS resolution, FIFO monitor-state activation, and deadline
  expiration during error decoding. The RDC review additionally corrected raw
  `E0`-through-`E9` classification to retain string PLC error fields, expanded
  the packed-consumer check to exercise the new API, and added missing poll and
  pre-send invalid-codec coverage. Cross-runtime review then found and fixed
  Node's default BOM removal so leading BOM bytes remain decoded payload data,
  and its WHATWG Shift_JIS control-byte remapping so CP932 `00` through `7F`
  remain identical ASCII code points. Strict invalid-single, malformed-pair,
  unassigned-pair, and Windows-31J extension vectors were added. There are no
  rejected, duplicate, or deferred self-review findings in this repository.
- Live PLC verification is not required for these deterministic local input,
  planning, parser, socket-state, editor, and packaging contracts. No PLC
  capability/profile assertion changed and no live PLC communication occurred.
- README, user guides, API reference, editor help, samples, changelog, release
  process, dependency metadata, and migration notes agree with the explicit
  RDC text-codec/raw-Buffer contract.

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

### User disposition

The target contract was approved by the user on 2026-08-01. An `RDC` comment encoding must not be fixed by the library or PLC profile and must not be guessed by UTF-8-first/Shift_JIS-fallback decoding. Text decoding requires an explicit caller-selected encoding, and exact raw comment payload bytes remain available. The Node.js/Node-RED implementation is complete in this working tree; the other affected runtime repositories are tracked independently.

### Implementation scope

- Node-RED `RDC` device-comment decoding and read-node/runtime APIs
- Cross-language comparison with the Python, Rust, and .NET Host Link implementations
- Shared Host Link user documentation where the resulting behavior is common

### Target state

An `RDC` response is first treated as an exact byte payload. A caller or node that requests text explicitly selects the supported encoding used for that decode. The Node-RED implementation performs no heuristic UTF-8-first fallback, PLC-profile selection, write-source inference, or silent replacement of malformed bytes. A public raw-byte path exposes the undecoded comment payload.

The cross-runtime public selections are exactly `utf8` and `cp932`. `cp932`
means the Windows-31J-compatible mapping commonly described by KEYENCE as
Shift_JIS. There is no separate strict Shift_JIS selection or public alias. In
Node.js, `cp932` maps internally to the WHATWG `shift_jis` decoder in fatal mode.
The wrapper preserves `00` through `7F` as identical ASCII code points, accepts
mapped half-width and double-byte Windows-31J code units, and rejects malformed,
unmapped, or nonportable singleton `80`, `A0`, and `FD` through `FF` bytes.

### Compatibility impact

This is an intentional breaking change. Existing string APIs and nodes that silently try UTF-8 and then Shift_JIS must require an explicit encoding selection, while callers that cannot assert an encoding use the raw-byte API/output. Migration notes must identify the required selection and the removal of heuristic decoding.

### Acceptance criteria

1. Every public `RDC` text-decoding path and comment-reading node requires an explicit supported encoding and has no automatic or profile-selected codec.
2. A public raw-byte API/output returns the undecoded `RDC` comment payload.
3. The exact codec mapping is defined consistently across all four runtimes, including whether Shift_JIS and Windows-31J/CP932 are separate selections.
4. Ambiguous byte sequences valid under multiple codecs decode only according to the caller's selection; malformed sequences fail without fallback or replacement.
5. Decoder failure and connection-state behavior are explicit and consistent with the library's protocol-error contract.
6. User documentation, tests, editor help, package contents, changelog, and migration notes agree with the approved contract in every affected implementation.

### Evidence and completion checklist

- [x] Evidence sufficient to reject a universal or profile-fixed `RDC` codec is recorded.
- [x] Shift_JIS versus Windows-31J/CP932 target mapping resolved for all four language runtimes.
- [x] Ambiguous and malformed byte vectors defined with evidence-backed expected results.
- [x] Further profile-by-profile live verification is not required to select the explicit-codec/raw-byte contract.
- [x] Target contract and compatibility impact explicitly approved by the user.
- [x] Node.js/Node-RED implementation completed in this repository.
- [x] Node.js/Node-RED tests added or updated for every acceptance criterion.
- [x] Node.js/Node-RED static checks, unit tests, editor smoke, npm package/consumer, and extracted-source checks passed.
- [x] Codex actual-diff and public-API self-review completed for this repository against the approved contract and cross-language consistency requirements.
- [x] Further live-PLC verification is not required for this deterministic decoder/API change; the earlier approved evidence remains recorded below.
- [x] Node.js/Node-RED documentation, migration notes, changelog, editor help, dependency metadata, and API reference agree with the implementation.
- [x] Implementation completed in every affected repository; each runtime retains independent evidence.
- [x] Final cross-runtime acceptance criteria verified and the family item marked complete.

### Current evidence boundary

Before this decision, the located implementations tried UTF-8 first and fell back to Shift_JIS. The Node.js/Node-RED implementation no longer does so. The located KEYENCE material says that KV-8000 strings use Shift_JIS in a specific EtherNet/IP connection-guide context, but it does not define the Host Link `RDC` response encoding: <https://www.keyence.co.jp/support/user/controls/plc/connection_guide/kv_iv4/>.

On 2026-08-01, after the user's explicit `OK`, a read-only live check used KEYENCE KV-X500 / `keyence:kv-x500` at `192.168.250.100:8501`. `RDC R000` returned `E38182E38184E38186E38188E3818A` (UTF-8 `あいうえお`) and `RDC R001` returned `E3818BE3818DE3818FE38191E38193` (UTF-8 `かきくけこ`). Both payloads fail strict Shift_JIS and CP932 decoding. This proves that a universal Shift_JIS assumption is unsafe; it does not prove that all `RDC` comments are UTF-8 or identify how the comment-writing path determines stored bytes. The approved explicit-selection/raw-byte contract therefore does not depend on resolving that mechanism.

The deterministic ambiguity vector `C2 A2` is valid UTF-8 `¢` and CP932 `ﾂ｢`;
the selected codec alone determines its value. Truncated `C2` under UTF-8 and
truncated lead byte `82` under CP932 are malformed and must fail. Node 18 and 24
provide the WHATWG Windows-31J-compatible `shift_jis` decoder with fatal error
mode, including CP932 extension mappings such as `87 40` to `①`; `cp932` is the
only public name for that target. UTF-8 `EF BB BF 41` decodes to `U+FEFF A`
rather than silently stripping the leading BOM; the same bytes selected as
CP932 fail as an invalid CP932 sequence. CP932 bytes `1A`, `1C`, and `7F`
preserve those exact ASCII code points; `80`, `A0`, and `FD` through `FF` are
rejected. Extension pairs `87 90`, `ED 40`, and `FA 4A` decode to `U+2252`,
`U+7E8A`, and `U+2160`, while malformed and unassigned pairs fail.

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

The GitHub source archive includes the repository tests and all fixtures required by them. From a clean extracted archive, `node test/run-tests.js` and the documented standard checks complete without references to intentionally omitted files. The npm registry package remains minimal and follows its separate package-content contract.

### Compatibility impact

GitHub source archives become larger because test assets are included; the published npm package does not expand as a consequence.

### Acceptance criteria

1. An archive produced from repository HEAD contains `test/run-tests.js` and every fixture or helper it requires.
2. `node test/run-tests.js`, JavaScript syntax checks, sample-flow JSON validation, and documented package checks run from the extracted archive with the expected nonzero test set.
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
