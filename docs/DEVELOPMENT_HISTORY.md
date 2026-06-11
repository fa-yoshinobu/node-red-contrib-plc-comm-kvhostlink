# Development History

## 2026-06-11 Archived Refactor Plan

The previous `refactor-instructions.md` was archived into this history file.

### Scope

- Package: Node-RED node for KEYENCE KV Host Link communication.
- Primary task: expand frame-string characterization tests for `lib/hostlink/client.js`.
- Implementation was intentionally limited to tests. Runtime behavior, Node-RED node schemas, package metadata, and dependencies were out of scope.

### Contracts To Preserve

- `lib/hostlink/*` `module.exports` shape.
- Exact transmitted Host Link frame strings, including fixed CR termination.
- Node settings, `msg` schema, and control messages such as `connect`, `disconnect`, and related commands.
- Protocol guard behavior, including pre-send rejection for unsupported `AT` writes.
- Dependency-free package structure, package version `0.2.10`, and `package.json` metadata.

### Debt Notes

- The main identified debt was insufficient command coverage in frame-string tests.
- Existing tests were high-level oriented; the intended improvement was to compare public client commands against recorded transmitted strings using the existing mock connection style.
- Other cleanup items were explicitly kept as report-only.

### Planned Verification

- Check `git status` before edits.
- Run the existing baseline commands and record test counts.
- Add tests command-by-command, running `npm test` after each safe group.
- Report the final coverage table, added frame strings, any mismatches, and final verification results.

### Out Of Scope

- Public API changes.
- Frame generation changes.
- Dependency, version, packaging, or Node-RED registration changes.
- Unrelated refactoring.
