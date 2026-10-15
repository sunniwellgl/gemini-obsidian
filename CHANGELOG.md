# Changelog

All notable changes to this project will be documented in this file.

## [1.8.1] - 2026-10-15

### Security

- Fix arbitrary file read and write outside the vault ([GHSA-74mh-44f5-p46j](https://github.com/thoreinstein/gemini-obsidian/security/advisories/GHSA-74mh-44f5-p46j)). The vault root could be relocated by tool arguments, which made the `getSafeFilePath` check meaningless. Reported by Artur Chlebicki ([@Artur12555](https://github.com/Artur12555)).
  - Removed the per-call `vault_path` argument from every MCP tool. Hooks no longer read it from tool input.
  - `obsidian_set_vault` only accepts an existing Obsidian vault (a folder containing `.obsidian`).
  - `obsidian_create_vault` refuses non-empty directories that are not already vaults and now creates the `.obsidian` folder.
  - A saved vault path that is not an Obsidian vault is ignored at startup, which clears configs poisoned under earlier versions.
  - CLI `--vault_path` must point at an Obsidian vault.
  - `subfolder` arguments can no longer escape the vault.
  - `getSafeFilePath` now uses a `path.relative` check.

### Changed

- **Breaking:** tools no longer accept `vault_path`. Set the vault once with `obsidian_set_vault` or `OBSIDIAN_VAULT_PATH`.

## [1.8.0] - 2026-10-14

### Added

- `obsidian_create_vault` tool: Create a new Obsidian vault directory. Pass `register: true` to also register it with the Obsidian desktop application (`obsidian.json`) on Linux, macOS, and Windows.
- CLI execution support for `obsidian_create_vault`.

### Build & Maintenance

- build(deps): bump sharp from 0.34.5 to 0.35.5 (requires Node.js >= 20.9)
- build(deps-dev): bump esbuild to 0.28.2 and vitest to 4.1.11 (pulls vite 8)
- build(deps-dev): bump transitive dependencies ip-address, express-rate-limit, @protobufjs/utf8, qs, brace-expansion, hono, fast-uri, postcss

## [1.7.1] - 2026-04-20

### Fixed

- Windows hook execution — replaced bash hook wrappers (`session-init.sh`, `validate-frontmatter.sh`, `reindex-note.sh`) with Node.js equivalents so hooks run on Windows where `bash` is not guaranteed
- Hardened hook wrappers against OS-level `spawn` failures by handling child process `error` events (prevents unhandled-event crashes)

### Removed

- Old bash hook wrappers under `scripts/` (replaced by `.js` equivalents)

### Build & Maintenance

- build(deps-dev): bump hono from 4.12.12 to 4.12.14

## [1.7.0] - 2026-04-11

### Added

- **Skills**: compound, cross-linker, index, journal, links, research, search, vault, vault-lint, wiki-ingest
- **Agents**: researcher (deep vault research), librarian (vault organization)
- SECURITY.md, CODE_OF_CONDUCT.md, PR template
- Repository metadata in package.json

### Fixed

- LanceDB stale fragment error on incremental reindex — call `table.optimize()` after indexing

### Changed

- Updated dependencies: @lancedb/lancedb 0.27, sharp 0.34, esbuild 0.28, TypeScript 6.0, @modelcontextprotocol/sdk 1.29

## [1.6.1] - 2026-03-30

### Build & Maintenance
- build(deps-dev): bump picomatch from 4.0.3 to 4.0.4

## [1.6.0] - 2026-03-19

### Features
- feat: add inline text replacement and broken link detection tools
- feat: add session initialization and frontmatter validation hooks
- feat: add new vault management skills (knowledge, link-audit, moc-update)

### Documentation
- docs: update README and obsidian-companion skill guidelines


## [1.5.0] - 2026-03-12

### Features
- feat: follow symlinks to support indexing external files

### Build & Maintenance
- build(deps): update mcp-related dependencies and rebuild dist
- chore(deps): bump ajv, express-rate-limit, ip-address, qs, minimatch, and hono
- chore: synchronize distribution bundle with version bump

## [1.4.0] - 2026-03-08

### Features
- feat(obsidian): add obsidian_replace_section and obsidian_insert_at_heading tools
- feat(obsidian): overhaul obsidian_append_daily_log with section range awareness

### Fixed
- fix(security): implement path traversal protection with getSafeFilePath

### Refactor
- refactor(rag): extract chunking logic to standalone module
- refactor(utils): centralize shared markdown utilities

### Testing
- test: add vitest infrastructure and comprehensive unit test suite

### CI/CD
- ci: add GitHub Actions workflow for automated testing

## [1.3.0] - 2026-02-08

### Features
- feat(rag): implement incremental indexing and overhaul vault processing

### Fixed
- fix: pin onnxruntime-node to 1.14.0 and add runtime compatibility check

## [1.2.0] - 2026-02-07

### Added
- feat(rag): overhaul indexing for large vaults and reliability

### Fixed
- fix: correctly handle boolean flags in CLI and prevent full re-index in hooks
- fix: use stdin for hook input to avoid shell substitution errors

### Changed
- chore: ensure dist/ is not ignored
- chore: update package-lock.json

## [1.1.0] - 2026-02-05

### Features
- 5d36f61 FEAT: implement incremental vault indexing

## [1.0.4] - 2026-02-05

... (rest of the file)
