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
