# TODO

Current active TODOs only.

## Current Status

The following items are cross-library API review candidates. They are not approved for implementation.

## HL-CROSS-API-001: Public API naming candidates (`decision_pending`)

Target state: the four Host Link implementations use the same concept names while retaining JavaScript camelCase. Each candidate must be approved separately before implementation.

| Current Node-RED API | Candidate canonical API | Reason |
|---|---|---|
| `readDWords` | `readDWordsSingleRequest` | The operation is one Host Link request and the other implementations expose the explicit canonical name. |
| `readComments` | `readComment` | One device produces one comment string, and `readCommentBytes` is already singular. |
| `checkErrorNo` | `readErrorNumber` | The API returns the PLC error number rather than a Boolean check result. |
| `writeSetValue` | `writeTimerCounterPreset` | The operation is the T/C-only `WS` preset write. |
| `writeSetValueConsecutive` | `writeTimerCounterPresetConsecutive` | The operation is the T/C-only `WSS` consecutive preset write. |
| `formatParsedAddress` | `formatAddress` | The other implementations use the common address-format concept without `Parsed` in the name. |

Migration candidate: add an approved canonical name in the next version and keep the old name as a direct forwarding alias for an independently decided transition period. Input, result, exception, and wire command must not diverge. Deprecated `readWords` is outside this review.

## HL-CROSS-API-002: High-level API parity candidates (`decision_pending`)

- [ ] Decide whether to add `writeDWordsSingleRequest`, implemented as the explicit high-level wrapper over the existing one-request DWord consecutive write path.
- [ ] Treat `readDWordsSingleRequest` as the canonical name candidate for existing `readDWords`; do not create a second behavior.
- [ ] Do not add `tryParseAddress` or a device-range catalog merely to equalize counts; their current value is insufficient for this review.
- [ ] Add implementation, exact public-identity tests, command/device/response/result live verification, API reference, migration note, and changelog only after each contract is approved.
