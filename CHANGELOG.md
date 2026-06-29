# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Entry labels**

- `Release`: Package/version metadata and publishing preparation.
- `Library`: Runtime behavior, public API, protocol handling, or validation in the distributed library.
- `Node-RED editor`: Node-RED node editor or runtime UI behavior.
- `Docs`: README, user guides, generated API docs, or other documentation-only changes.
- `Samples`: Examples, sample flows, sample scripts, or sample applications.
- `Tests`: Test suites, test fixtures, golden vectors, or verification data.
- `Tooling`: Developer/operator command-line tools and helper utilities.
- `CI`: Release checks, workflow scripts, or automation-only changes.

## [Unreleased] - 2026-06-28

### Changed
- Library: Made Host Link device parsing require explicit device areas and value-format suffixes; numeric-only devices no longer default to `R`, and suffixless named addresses no longer infer a default format.
- Library: Removed `msg.payload` fallback for read/write parameters; read messages must use `msg.addresses`, and write messages must use `msg.updates` or `msg.address` plus `msg.value`.
- Node-RED editor: Static write updates now require a JSON object; `address=value` line parsing and scalar value fallback are no longer accepted.
- Docs: Updated Node-RED Host Link getting-started, gotchas, supported-register, and usage guidance for explicit message fields and explicit device/value-format requirements.

### Fixed
- Library: Made `BIT_IN_WORD` helper addresses require an explicit bit index such as `DM100.0` through `DM100.F`; `DM100:BIT_IN_WORD` now fails in `parseAddress`, `formatParsedAddress`, `readNamed`, and `writeNamed` instead of silently reading or writing bit 0.
- Tests: Added coverage for rejecting `BIT_IN_WORD` addresses without an explicit bit index.
- Tests: Updated core and high-level tests for explicit device/value-format requirements, no `msg.payload` fallback, and JSON-only static updates.

## [1.0.1] - 2026-06-25

### Changed
- Release: Bumped npm package metadata to `1.0.1`.
- Node-RED editor: Removed the default PLC profile selection so users must choose an explicit canonical profile.
- Library: Required `plcProfile` when constructing `HostLinkClient` directly, rejecting empty or omitted profile values.
- Docs: Clarified that write examples restore the original PLC values after demonstration writes.

### Fixed
- CI: Updated npm duplicate package version checks to use registry metadata instead of requiring the local npm CLI.

## [1.0.0] - 2026-06-24

### Changed
- Release: Bumped package metadata to `1.0.0` for the first stable release line.
- Node-RED editor: Show human-readable PLC profile labels while continuing to save canonical `keyence:...` profile values.
- Library: Preserve the selected `plcProfile` as connection/client metadata and expose it from `getProfile()`.

### Fixed
- Library: Reject invalid Host Link connection ports before constructing the runtime client.
- Library: Validate Host Link timeout values as finite positive numbers in both the connection node and low-level client.
