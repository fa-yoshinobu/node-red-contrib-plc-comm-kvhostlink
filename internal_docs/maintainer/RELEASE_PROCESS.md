# Release Process

This checklist governs npm and GitHub publication for this repository.

## Pre-Tag Gate

1. Use a clean release branch and run `release_check.bat` before the version exists in npm.
2. Confirm `package.json`, runtime metadata, CHANGELOG, user docs, examples, and generated API documentation agree.
3. Enumerate every unchecked repository TODO and maintainer checkbox. Pass it, mark it explicitly not required, or record an item-by-item release disposition in the active release GOAL.
4. Confirm all intended changes are under the target CHANGELOG version before creating the immutable annotated tag.

## Publication Integrity Gate

1. Inspect the GitHub `.tgz` before running `npm publish`.
2. Publish the inspected `.tgz`, then compare the npm registry tarball byte-for-byte with that asset.
3. Build the shared docs site in a fresh virtual environment and require the Python package version/symbol check plus `mkdocs build --strict`.
4. Verify the fixed tag target, final Release state/assets, docs deployment, open release PR count, and clean working tree.
5. List every permitted unverified hardware scope in the final release summary; never convert it to a live pass.
