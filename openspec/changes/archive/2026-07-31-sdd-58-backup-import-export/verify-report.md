# Verify Report — SDD-58 Backup Export

### Verdict

PASS

Verified by the orchestrating agent directly, not delegated (AGENTS.md "Delegation and
Verification Guardrails"). Covers all three slices: 58a (export core), 58b (Wails binding),
58c (frontend panel).

## Gates (run by the orchestrator, actual output)

| Gate | Result |
|---|---|
| `go build ./...` | Clean |
| `go test ./...` | All packages pass |
| `go vet ./...` | Clean |
| `gofmt -l .` | Empty |
| `golangci-lint run ./...` | **0 issues** |
| `go run ./tools/checkgofilesize` | "Go file size check passed." |
| `go run ./tools/checkarchitecture` | Clean, exit 0 |
| `bun --cwd=frontend run test` | 161 files / 1344 tests passed |
| `bun --cwd=frontend run validate` | 0 errors (5 pre-existing warnings, unrelated files) |
| `bun --cwd=frontend run fallow audit` | Exits 1 on pre-existing repo debt; **zero findings attributable to this change** |
| `git diff docs/openapi.yaml` | Empty — unchanged, as specified |

## Architecture invariant verified independently

`go list` on `./internal/backup/` returns only: `archive/zip, context, crypto/sha256,
encoding/hex, encoding/json, errors, fmt, io, os, time`. **Zero `autoreas-bridge/...` imports.**

This change deliberately ships **no linter** enforcing that boundary — the rule and the
`RestorePointMaker` port it justified were both cut as ceremony (design.md). The invariant is
convention-held. Re-check it by hand when touching this package.

## Defects found and fixed during verification

Not reported by the apply agents; found by running the gates the commit hook actually runs.

1. **11 `errcheck` violations** across `bundle.go`, `bundle_test.go`, `export_test.go`,
   `sync/backup_export.go`, `season/backup_export.go` — unchecked deferred `Close()` and an
   unchecked `fmt.Fprintf`. The agents ran `go vet`, which does not catch these; the commit hook
   runs `golangci-lint`, which does. Fixed with explicit `_ =` plus a comment stating why the
   error is discarded.
2. **Newly-added dead code.** `frontend/.../BackupPanel/index.ts` was flagged `unused-files`
   because `preferences-route.constants.ts` imported the concrete file, bypassing the barrel.
   Five sibling features carry the identical pre-existing finding, but that does not license
   adding a sixth. Fixed by importing through the barrel.
3. **Duplicate and unused type exports.** `backup-panel.types.ts` re-exported
   `BackupExportResultDTO` and `BackupGroupResultDTO`, duplicating `backup-source.types.ts`;
   `createBackupSource` was exported but only ever used to build the singleton in its own file.
   Fixed by importing the DTO from its owner and unexporting the factory.

## Mutation verification

| Guard | Test | Mutation | Result |
|---|---|---|---|
| 3 | `TestManifestIsWrittenAfterEveryDataEntry` | Manifest write hoisted above the group loop | FAILED as required |
| 4 | `TestExportErrorWritesNoManifest` | `return` after a failing `g.Export` deleted | FAILED as required |
| 7 | `TestAnimeExportWritesIncrementally` | Row loop replaced with collect-then-marshal | FAILED as required |
| 8 | `TestExportFuncReportsCountItWrote` | `count++` deleted from the row loop | FAILED as required |
| 5 | `TestExportedBundleContainsNoExcludedTableData` | 4th group added for `app_settings` | FAILED as required — marker leaked |
| 6 | `TestExportedBundleHasExactlyThreeGroups` | One group dropped from the slice | FAILED as required |
| FE | `classifyExportOutcome` cancelled branch | Cancelled branch deleted | FAILED as required |
| FE | `use-backup-panel` re-entrancy | `if (isExporting) return` deleted | FAILED as required — mock called 3× |

Guards 3 and 4 were mutated and reverted by the orchestrator. Every mutation was reverted and
the suite re-confirmed green. New files are untracked, so `git checkout --` cannot restore
them — scratch-copy/restore was used.

## Spec conformance

- Single `.zip` with `manifest.json` + `data/{name}.jsonl` per group.
- English manifest keys; `formatVersion` a JSON number equal to `SupportedFormatVersion` (1).
- Per-entry `sha256` computed from written bytes via `io.MultiWriter`, not a second read.
- **Manifest written last**; an export error returns immediately and writes no manifest.
- Export scope is exactly `anime_snapshots`, `seasons`, `season_animes` — proven by a
  marker-scan test seeding every excluded table and asserting zero leakage.
- Streaming: one row → one JSONL line (guard 7 proves it behaviorally).
- `snapshot_json` carried opaquely, byte-identical against the stored-shape fixture.
- Desktop-only: a reflection test asserts no REST route or WS event exposes export;
  `docs/openapi.yaml` is unchanged.
- Cancelling the save dialog writes nothing and returns no error.

## Drift recorded (code wins)

1. `season.CreateSeasonAnime` stores Go zero-value strings as SQL `''` for `matched_slug`,
   `anime_id`, `match_candidates_json`; only `premiere_grade`, `grade_source`, `rated_at` pass
   through a nullifying helper. Test assertions match real storage behavior. Export functions
   are correct either way — they carry through whatever SQLite holds.
2. This repo's dumb feature panels call their colocated hook directly with zero props
   (`PairingPanel`, `SyncingAnimePanel`, `DownloadsRootPanel`). "Render from props" is not the
   established pattern; `BackupPanel` follows the repo.
3. Feature hooks reach Wails through an `infrastructure/*-source` singleton, never importing
   `wailsjs/go/main/App` directly. `use-backup-panel.ts` follows that.
4. No `PathPickerField` — the destination comes solely from the native save dialog.
5. ADR filename is `009-backup-bundle-format-and-decentralized-ownership.md`; design.md names
   it `...-export-seam.md`. Same content.
6. **`tools/checksdd` rejects any unchecked `- [ ]` in `tasks.md`**, so a change cannot be
   committed slice-by-slice. The 58a/58b/58c slicing was a review-burden device; the repo
   enforces one change = one commit. All three slices therefore land together.

## Known repo issues surfaced, not fixed here

- Three `AnimeEditorWorkspace` tests are **flaky under CPU load** (5s timeouts) — they failed
  inside the pre-commit hook while `golangci-lint` and `go-cover` ran concurrently, and pass in
  isolation (1344/1344). Not caused by this change.
- `fallow audit` exits 1 on `main` independent of this change (five feature `index.ts` barrels
  plus test tooling flagged `unused-files`), which means a full-repo audit is already red.
- `HosterPriorityEditor.tsx` uses `react-aria-components`' `useDragAndDrop`, whose mouse path
  is native HTML5 DnD — forbidden by AGENTS.md rule 11 because it does not work in WebView2.
  This is why hoster reorder does not work, and why `download_hoster_priority` is out of scope.
- `AGENTS.md` references `docs/sdd-tree.md` and `docs/autoreas-bridge-design-doc.md`; neither
  file exists, and Mandatory Workflow item 1 instructs every agent to read the former first.

## Not verified (out of scope)

Import is unimplemented by design. The policies settled during review — fail-closed on a newer
`formatVersion`, tolerant reader over per-version parsers, full refresh, and **omission is not
deletion** — are recorded in the spec's non-normative "Deferred to Import" note for SDD-59.
