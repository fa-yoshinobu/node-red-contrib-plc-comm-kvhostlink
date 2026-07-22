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

## [Unreleased]

### BREAKING
- Library: Removed the undocumented deep-import-only `FORCE_DEVICE_TYPES` alias. Internal command validation continues to use the distinct `FORCE_SINGLE_DEVICE_TYPES` and `FORCE_CONSECUTIVE_DEVICE_TYPES` sets.

## [3.2.0] - 2026-07-17

- Release: Bumped npm package and lockfile metadata to `3.2.0`.
- CI: Excluded maintainer-only files, tests, and release tooling from generated source archives while retaining the complete example flow set, and added source-archive contract checks to local, CI, and release gates.

- Library: Added immutable client-lifetime traffic snapshots through `trafficStats()`.
- Library: Made TCP receive-byte accounting independent of CR/LF segmentation by counting the response body and first terminator only; UDP datagram accounting is unchanged.
- CI: Install the editor smoke-test dependencies during release packaging validation.

## [3.1.0] - 2026-07-13

### BREAKING
- Library: `HostLinkClient` now requires explicit `port`, `transport`, and PLC profile metadata; commands require an explicit successful `connect()` after construction, close, or transport failure.
- Library: Low-level numeric device APIs now accept a base device and a separate required `dataFormat`; suffix-bearing inputs such as `DM100.D` are rejected. Expansion-unit buffer access also requires an explicit format.
- Library: `sendRaw` returns undecoded response body bytes, `setTime` requires an explicit value, comment padding options are removed, and public buffer/trace options are removed.
- Node-RED: Saved source types, output/metadata/error modes, terminal counts, and single-write dtype intent are required and validated without runtime fallback. Single-write dtype must appear exactly once, either in the address or as exact uppercase `BIT/U/S/D/L/F/H`; `COMMENT` remains read-only. Double, missing, invalid, or incomplete selector forms fail before connect/write. A present invalid runtime read/write property never falls back to configured addresses or updates.
- Node-RED: Connection/read/write `name` is optional display-only state. It is trimmed, non-string/blank input means no custom label, duplicates are allowed, and it never changes node identity, connection selection, request content, or metadata.
- Node-RED editor: `str` and `object` remain initial values for new nodes only. Missing/invalid
  source types or output modes are rejected; failed non-literal references never become literal
  PLC input.
- Node-RED: Read output shapes are fixed: `object` is always address-keyed, `array` is always an
  array, and `value` requires exactly one address.
- Node-RED: Full/minimal metadata removes stale owned fields, preserves custom fields, and identifies
  only the current read/write operation. Off leaves existing `msg.kvhostlink` unchanged.
- Node-RED: Throw/msg/output2 now uniquely determine failure routing and terminal count. Coercible
  string/Boolean terminal counts and conflicting saved counts are rejected.

### Added
- Library: Added `profileDescriptors()` for canonical Host Link profile metadata.

### Changed
- Samples: All saved connection and runtime mode fields are explicit.
- Docs: Updated the API and usage contracts for explicit lifecycle, data formats, and Node-RED runtime validation.

### Fixed
- Library: `readTyped(..., "BIT")` now recognizes `ON`/`OFF` and `1`/`0` exactly instead of treating `ON` as false.
- Library: Bit-in-word updates on one client serialize the complete read-modify-write sequence, preventing concurrent updates from overwriting each other.
- Library: Numeric writes reject fractional, non-finite, string, and out-of-range values instead of masking or coercing them; typed numeric responses no longer fall back to strings.
- Library: TCP response state and UDP socket generations are invalidated on timeout/failure, and the internal response cap is not user-adjustable.
- Library: UDP responses without a CR/LF terminator now fail and invalidate the socket instead of accepting a truncated datagram.
- Library: Validate RD, RDS, URD, and monitor response token counts from the issued command, including 16/32-point direct-bit numeric reads; malformed response shapes and direct-bit tokens other than documented `0`/`1`/`ON`/`OFF` invalidate the session.
- Library: Address lists reject unparsed garbage; named read/poll/write operations reject empty work; and named writes validate every update before the first request.
- Library: JavaScript `Date` clock writes require a valid year from 2000 through 2099, and Float32 writes reject finite values that overflow when encoded.
- Node-RED editor: Dynamic source-field validation now uses the active editor widget only for the node currently being edited, preventing another editor instance from changing validation results.

- Library: Corrected ten KV device range cells against live PLC hardware and the KEYENCE simulator, and pinned the canonical profile source to `plc-comm-hostlink-profiles` `v1.2.0`. `VM` widens to `VM0-9999` on KV-NANO and `VM0-59999` on KV-3000/KV-5000; `Z` widens to `Z1-23` on KV-8000. `CTH` narrows to `CTH0-1` on the KV-3000 and KV-5000 XYM profiles, matching their base profiles.
- Library: Parse scalar and batched `BIT` writes strictly so `"false"` and `"0"` write OFF, while ambiguous values fail before transport.
- Docs: Removed the hand-maintained Getting Started navigation block in favor of site navigation.

## [3.0.0] - 2026-07-10

### Changed
- Release: Bumped npm package and lockfile metadata to `3.0.0`.
- Security: Protected the profile metadata admin endpoint with the `flows.read` permission.
- Docs: Replaced relative README links with absolute URLs so they resolve on package registry pages.

### Added
- Library: Added `availablePlcProfiles()` and `profileFromName()` for profile enumeration and descriptor access.
- Node-RED editor: Added a runtime profile metadata endpoint for the connection editor dropdown.

### Docs
- Docs: Documented the Host Link profile descriptor and enumeration helpers.

## [2.0.0] - 2026-07-06

### BREAKING
- Release: No npm package name changed; this package is versioned at `2.0.0` to align with the plc-comm family breaking release wave.

### Added
- Docs: Added `docsrc/user/API_REFERENCE.md` as the standard user-facing API index and linked it from the README.

### Changed
- Release: Bumped npm package metadata to `2.0.0`.
- Docs: Added the plc-comm family package matrix link to the README.
- CI: Kept the tag-driven release workflow for the npm package tarball.

## [1.3.0] - 2026-07-06

### Added
- Release: Bumped package metadata to `1.3.0` and synced the embedded profile fixture to `plc-comm-hostlink-profiles` `v1.1.0`.
- Library: Added `CTH`/`CTC` (high-speed counter / comparator, codes 04H/05H) device support to the address parser and command device-type sets, treated like the counter (`C`) device. Availability is model/unit dependent (governed by the canonical catalog).

### Changed
- CI: Added a tag-driven release workflow that re-runs checks and attaches the npm package tarball to the GitHub release.

## [1.2.0] - 2026-07-05

### Changed
- Release: Bumped package metadata to `1.2.0`.
- Tooling: Normalized line-ending handling in the canonical profile JSON update script so `-SourceRoot` runs no longer report false changes.
- Library: Synced the embedded KV Host Link device-range fixture to `plc-comm-hostlink-profiles` `v1.0.1`, including `display_name` labels for KEYENCE model families and XYM variants.
- Library: Added `displayName(profileId)` as the public UI-label helper while keeping stored PLC profile values canonical.
- Node-RED editor: Updated the `kvhostlink-connection` PLC profile selector to show canonical `display_name` labels while preserving canonical `keyence:...` option values.
- Docs: Documented the profile display-name helper and canonical-ID storage guidance.
- Tests: Added canonical fixture parity and editor-option coverage for profile `display_name` values.
- Samples: Added a read-only `kvhostlink-multi-plc-monitor.json` operational flow with long-form row output and reconnect backoff guidance.
- Docs: Removed the per-library troubleshooting/code page; shared KV Host Link troubleshooting and code guidance now lives in the PLC Setup Guide.
- Docs: Removed the per-library latest communication verification page and links so user docs stay focused on usage, not verification logs.
- Docs: Removed the manual page-navigation block from Getting Started and rely on site navigation instead.
- Docs: Removed the thin per-library Troubleshooting page after moving common KV Host Link troubleshooting to the PLC Setup Guide.
- Docs: Moved shared KV Host Link gotcha and troubleshooting items to the common PLC Setup Guide and standardized the Gotchas page structure with SLMP.
- Docs: Moved shared supported-register and device-range guidance to the common KV Host Link Device Ranges page and kept the user docs to Getting Started, Usage Guide, PLC Profiles, and Gotchas.

## [1.1.1] - 2026-06-29

### Changed
- Release: Bumped npm package metadata to `1.1.1`.
- Docs: Documented explicit KV Host Link value-format requirements in existing user docs.
- Samples: Updated example flows to use explicit value-format suffixes.

## [1.1.0] - 2026-06-29

### Changed
- Release: Bumped npm package metadata to `1.1.0` for stricter Node-RED input validation changes.
- Library: Made Host Link device parsing require explicit device areas and value-format suffixes; numeric-only devices no longer default to `R`, and suffixless named addresses no longer infer a default format.
- Library: Removed `msg.payload` fallback for read/write parameters; read messages must use `msg.addresses`, and write messages must use `msg.updates` or `msg.address` plus `msg.value`.
- Node-RED editor: Static write updates now require a JSON object; `address=value` line parsing and scalar value fallback are no longer accepted.
- Docs: Updated Node-RED Host Link getting-started, gotchas, supported-register, and usage guidance for explicit message fields and explicit device/value-format requirements.

### Fixed
- Library: Reject unknown dtype suffixes such as `:BOGUS` instead of forwarding them as Host Link data formats.
- Library: Made `BIT_IN_WORD` helper addresses require an explicit bit index such as `DM100.0` through `DM100.F`; `DM100:BIT_IN_WORD` now fails in `parseAddress`, `formatParsedAddress`, `readNamed`, and `writeNamed` instead of silently reading or writing bit 0.
- Tests: Added coverage for rejecting `BIT_IN_WORD` addresses without an explicit bit index and rejecting unknown dtype suffixes.
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
