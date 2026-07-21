# Tasks: SDD-55 Legacy Breakup (Full Cold Cut)

## Review Workload Forecast (summary)

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1800-2600 total across 4 slices |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR A (cut channel) → PR B (relocate codec, delete file I/O) → PR C (English-ify additive) → PR D (docs/governance) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|------------------|--------------------|
| A | Cut runtime channel, SQLite-only boot | PR A | `go test ./internal/anime/... ./internal/sync/...` | Boot binary with no `animes.dat` present | Revert PR A: watcher/catchup/arbitration files restored from git history |
| B | Relocate codec, delete file I/O, drop `animes.dat` | PR B | `go test ./internal/anime/store/...` | Codec round-trip against cloned real `snapshot_json` fixture | Revert PR B: `legacy/` package and fixture restored from git history |
| C | Additive English-ification + openapi aliases | PR C | `go test ./internal/download/... ./internal/sync/...` | Migration idempotence run on seeded DB | Revert PR C: migration entry and renames removed, DB rows untouched (additive) |
| D | Docs/governance rewrite, retire linter+specs | PR D | `go test ./tools/checkarchitecture/...` (removed) + `go run ./tools/checkgofilesize` | `go run ./tools/checkopenapi` | Revert PR D: docs/specs/linter restored from git history |

## Phase 0: Task-Level Decisions (pin design's open questions)

- [x] 0.1 Pin relocated codec package as `internal/anime/store` (package `store`); no "legacy" naming remains. *(Deferred execution to Slice B; decision recorded — Slice A did not relocate the codec, per ADR-55-3/55-5 ordering.)*
- [x] 0.2 Pin Slice C schedule-day representation as **read-time mapping** in the download-selection domain (ADR-55-4 option a) — no new stored column, migration registry entry still added for the idempotence scenario. *(Executed in Slice C: `internal/download/service_selection.go`'s `englishWeekday()` read-time translation + `internal/sync`'s additive `schedule_day_migrated_at` marker column.)*
- [x] 0.3 Pin `bridge_owned_animes` handling as **removal** from bootstrap/wiring in Slice A (cleanliness; no reader survives Slice A). Implemented: `internal/sync/bridge_owned_store.go` deleted, DDL removed from `schema_tables.go`/`schema.go`; existing user DBs keep the orphaned table untouched (no destructive migration).

## Slice A — Cut the runtime channel

### Phase A1: RED (write first)
- [x] A1.1 Test: boot with no `animes.dat` present succeeds and serves catalog. `TestAppStartupSucceedsWithNoLegacyFileOnDisk` (app_no_legacy_channel_test.go).
- [x] A1.2 Test: boot on empty SQLite serves empty catalog (no panic, no wait loop). `TestAppStartupOnEmptyRealSQLiteServesEmptyCatalogWithoutWaiting` (app_no_legacy_channel_test.go).
- [x] A1.3 Test: write patch finalizes to `anime_snapshots` with zero file I/O. `TestWriteServiceCreateAnimeFinalizesToSnapshotStoreWithZeroFileIO` (internal/anime/write_service_no_file_io_test.go).
- [x] A1.4 Test: shutdown/startup enumerates zero watcher goroutines. `TestAppStructHasNoLegacyRuntimeChannelFields` (app_no_legacy_channel_test.go) — structural proof: the App struct no longer declares any watcher/coordinator/registry field, since the types themselves are deleted.

### Phase A2: GREEN
- [x] A2.1 Delete `internal/anime/{watcher,snapshot,startup_catchup,snapshot_pull_pipeline}.go` + tests. `SnapshotRecord`/`ParseWarning`/`HashSnapshot`/`SnapshotStore`/`EventPublisher`/`WarningLogger` (still load-bearing for the retained codec) re-homed into new `internal/anime/snapshot_types.go`.
- [x] A2.2 Delete `internal/anime/{bridge_native_registry,restore_bridge_native,manual_pull}.go` + tests. `WriteServiceDeps.Ownership` and the register-before-write guard removed from `write_service.go` (ownership arbitration has no purpose once Legacy is not a data source).
- [x] A2.3 Remove `internal/sync/bridge_owned_store.go` and `bridge_owned_animes` DDL/wiring per decision 0.3.
- [x] A2.4 Modify `app_startup_runtime.go` (`prepareAnimeRuntime`; `startAnimeObservers` deleted), `app.go` (`restoreBridgeNativeAnimeState` deleted, factories dropped), `app_runtime.go` (`PullAnimesFromLegacy` deleted), `app_runtime_services.go` to drop observer wiring. Deviation: the file-writer itself is *not* dropped — `prepareAnimeRuntime` still constructs `anime.UpdateWriter` (needed for `PublishCommitted`/outbox-publish and `RecoveryConfigured`), but wires a new `noopAnimeAppendLine` instead of real file I/O (see risks).
- [x] A2.5 Delete `resolveAnimeDataPath` (`internal/anime/paths.go`); modify `app_defaults.go`/`app.go` to stop resolving a Legacy data path (the `animeDataPath` parameter is dropped from `configureRuntimeServices`/`prepareAnimeRuntime` entirely, not just left empty).
- [x] A2.6 Stop wiring a real `FilePath` for production; deviation — the `Append`/`FilePath` port itself stays defined in `legacy_gateway_config.go`/`gateway_write_helpers.go` (unchanged) so the wide existing unit-test surface (which observes writes via `stubAnimeWriter`) keeps working; only `prepareAnimeRuntime`'s `AppendLine` is now a no-op. See risks for why the literal "delete the port" reading of this task broke ~25 pre-existing tests.
- [x] A2.7 Remove the `PullAnimesFromLegacy` Wails binding usage from frontend call sites (CatalogPanel UI, hook, types, constants, helpers, and ~15 test files updated/trimmed). Go-side `App.PullAnimesFromLegacy` method deleted too. `wailsjs/go/main/App.{d.ts,js}` and `models.ts` bindings were regenerated in the working tree (the `PullAnimesFromLegacy` entry and `contracts.AnimeLegacyPullResult` model are gone) — verified via `git diff`, no manual `wails generate` needed.

### Phase A3: Verify
- [x] A3.1 `go test ./...` — all packages green (also ran frontend `bun run test`: 134 files / 1100 tests green).
- [x] A3.2 `golangci-lint run` — 0 issues.
- [x] A3.3 `go run ./tools/checkgofilesize` — passed.

## Slice B — Delete legacy file-channel, relocate codec

### Phase B1: RED (write first)
- [x] B1.1 Test: codec round-trip (decode→merge→encode) on a cloned real stored `snapshot_json` shape (`t.TempDir()`, never mutate real fixtures) preserves unknown Spanish keys byte-for-byte, authored in `internal/anime/store`. `TestCodecRoundTripPreservesRealStoredSnapshotShape` (internal/anime/store/codec_roundtrip_test.go), fixture cloned from a real `resources/autoreas-data/animes.dat` line into `internal/anime/store/testdata/real_snapshot_shape.jsonl` before the real file was deleted (B2.5).
- [x] B1.2 Test: package-relocation smoke — read/write path stays green through the moved package. `TestPackageRelocationSmokeReadWriteStaysGreen` (internal/anime/store/codec_roundtrip_test.go).

### Phase B2: GREEN
- [x] B2.1 Create `internal/anime/store` (decision 0.1); move `wire.go`, `wire_validation.go`, `mapper.go`, `projection.go`, `create.go`, `gateway.go`, `gateway_write_helpers.go`, `gateway_contracts.go`, `outbox.go` (+ `editor_mutation.go`, `recovery.go`, and their retained tests, not separately enumerated in the design's file table but part of the same codec/gateway surface); strip the `Append`/`FilePath` port and file-append branch. Package-relocation via `git mv` + `sed` package rename; `store` package doc comment/naming carries no "legacy" identifiers.
- [x] B2.2 Delete `file_mutation.go`, `batch.go`, `batch_durability_*` (+ their tests), file-append parts of `append_error.go` (whole file deleted, since append classification is unused once the Append port is gone); delete the file-append branch in `recovery.go`, retaining staged-op replay — rewritten as Finalize/FinalizeBatch retries (see Deviations). `ApplyBatch` reworked into `gateway.go` as a SQLite-only batch (stage+finalize, no file journal), per design's explicit instruction.
- [x] B2.3 Delete `internal/anime/parser.go` (`.dat` parser) + `parser_test.go`. `writer.go` was NOT deleted wholesale (see Deviations) — its file-I/O internals (`AppendLine`/`defaultAppendLine`/`appendRecord`/`appendSyncWriter`) were stripped instead, since `updateWriter` is still the load-bearing `PublishCommitted` implementation wired in `app_startup_runtime.go` (`a.animeUpdateWriter`), outside this slice's file scope. `writer_test.go`/`writer_append_test.go`/`writer_test_helpers_test.go` deleted.
- [x] B2.4 Update imports in `write_base_store.go`, `legacy_gateway_config.go` (renamed `store_gateway_config.go`, function `newStoreGatewayConfig`), `mobile.go`, `service.go`, `editor_service.go`, `schedule_service*.go`, plus `write_service.go`, `app_season_availability.go`, `app_startup_runtime.go`, `app_startup_recovery_order_test.go` to the relocated package (not separately enumerated in the design's file table but required by the import-path change).
- [x] B2.5 Delete `resources/autoreas-data/animes.dat`. Confirmed untracked/gitignored (`git ls-files` empty, `.gitignore` has `resources/autoreas-data/*.dat`) — deletion has zero tracked diff. Testdata clones taken before deletion: `internal/anime/store/testdata/{real_snapshot_shape,legacy_snapshot_fixture}.jsonl` were prepared, but the 795-line full-library clones were REMOVED again and replaced with small hand-authored synthetic fixtures once the real-library-data privacy exposure was recognized (see Deviations) — only the single-line `real_snapshot_shape.jsonl` (B1.1's required RED fixture) remains committed.
- [x] B2.6 Delete `legacy/*_test.go` file-channel suites (`batch_durability_test.go`, `batch_durability_helpers_test.go`, `gateway_concurrency_test.go`/`gateway_outbox_test.go` file-append cases rewritten to SQLite-only, `gateway_recovery_test.go` deleted entirely — ambiguous-append recovery no longer applies), `parser_test.go`, `writer_*_test.go`. No `watcher_*_test.go`/`startup_catchup_*_test.go`/`legacy_boundary_test_helpers_test.go` remained (already removed in Slice A).

### Phase B3: Verify
- [x] B3.1 `go test ./...` — all packages green.
- [x] B3.2 `golangci-lint run` — 0 issues.
- [x] B3.3 `go run ./tools/checkgofilesize` — passed.

## Slice C — English-ify unstored Spanish boundaries (additive)

### Phase C1: RED (write first)
- [x] C1.1 Test: migration re-run on an already-migrated DB is a no-op. `TestScheduleDayMigrationRerunIsNoOp` (internal/sync/sqlite_bootstrap_migrations_test.go).
- [x] C1.2 Test: existing schedule-day rows (Spanish `dias`) are preserved unchanged after migration. `TestScheduleDayMigrationPreservesExistingSpanishDiasRows` (internal/sync/sqlite_bootstrap_migrations_test.go).
- [x] C1.3 Test: "airing today" matching reads the English representation via read-time mapping (decision 0.2). `TestListActiveAnimesTodayMatchesStoredSpanishDiaAgainstEnglishTarget` + `TestEnglishWeekdayTranslatesEverySpanishLiteral` (internal/download/service_selection_weekday_test.go).
- [x] C1.4 Test: no exported `SpanishWeekdayName`/`spanishWeekdayNames` symbol remains reachable from `internal/download`. `TestNoExportedSpanishWeekdayVocabularyRemainsInDownloadPackage` (internal/download/config/defaults_test.go).
- [x] C1.5 Extend `checkopenapi` gate test asserting English wire aliases are documented additively alongside Spanish fields. `TestPatchAnimeRequestBodyDocumentsEnglishAliasesAdditively` (tools/checkopenapi/main_test.go).

### Phase C2: GREEN
- [x] C2.1 Rename `spanishWeekdayNames`/`SpanishWeekdayName` → English weekday terms (`Monday`…`Sunday`) in `internal/download/config/defaults.go`. Implemented as `WeekdayName(t time.Time) string` returning `t.Weekday().String()` (no map needed; stdlib already yields the English name), replacing both the map and the exported Spanish function.
- [x] C2.2 Update download-selection comparison call sites to read the English representation (read-time mapping; no stored change). `internal/download/service_selection.go`: `target := config.WeekdayName(...)`; each stored `d.Dia` is translated via a new unexported `spanishToEnglishWeekday` map + `englishWeekday()` helper before comparison. The `seasonModeDiaName` ("Ver hoy") sentinel passes through unmapped/unchanged, since it isn't a weekday literal.
- [x] C2.3 Register an additive, idempotent schedule-day migration entry in the `internal/sync` migration/schema registry (same mechanism as the `anime_snapshots.modified_at` additive column). Added `schedule_day_migrated_at INTEGER NOT NULL DEFAULT 0` to `animeSnapshotsDDL` (schema.go) plus `ensureScheduleDayMigrationColumn` in `migrateAnimeSnapshotsSchema` (schema_tables.go) — the column carries no comparison data (decision 0.2 is read-time mapping in Go, not SQL); it exists solely as the idempotence-scenario target the design calls for.
- [x] C2.4 Add English wire field aliases additively to `docs/openapi.yaml` for `PATCH /api/animes/{id}`; keep `estado`/`nrocapvisto`/`dias`. Added `status`/`episodesWatched`/`days` schema properties (each cross-referencing its Spanish counterpart) and wired the actual decode path: `internal/api/handlers/anime_handler.go`'s `decodePatchEstado`/`decodePatchProgress`/`decodePatchDays` now accept either name via a new `firstPresentField` helper (English preferred, Spanish still fully functional) — the openapi spec's "Bridge MUST accept the renamed fields going forward" requirement needed the transport layer updated, not just the doc.
- [x] C2.5 Add the mobile-coordination announcement block to `docs/openapi.yaml` per the API-consumer doc-update convention; coordinate with `autoreas-mobile` before merge. Added a `2026-07-21 — SDD-55` paragraph to the `info.description` block (alongside the existing SDD-52 note) stating the rename is additive-only and that `autoreas-mobile` migration is on its own schedule.

### Phase C3: Verify
- [x] C3.1 `go test ./...` — all packages green.
- [x] C3.2 `golangci-lint run` — 0 issues.
- [x] C3.3 `go run ./tools/checkgofilesize` — passed.
- [x] C3.4 `go run ./tools/checkopenapi` — `OpenAPI gate passed.`

## Slice D — Docs & governance

### Phase D1: RED (write first)
- [x] D1.1 Test/gate-list assertion: `legacy_boundary` is no longer a registered pre-commit/CI check. `TestRunHasNoLegacyBoundaryCheck` (tools/checkarchitecture/main_test.go) proves a file that would have violated the old legacy-DTO/JSON-key rules now passes `run()` cleanly.

### Phase D2: GREEN
- [x] D2.1 Delete `tools/checkarchitecture/legacy_boundary.go` + `legacy_boundary_*_test.go`; deregister from the gate list. Deleted `legacy_boundary.go`, `legacy_boundary_ast.go`, `legacy_boundary_flow.go`, `legacy_boundary_evaluate.go`, `legacy_boundary_values.go`, `legacy_boundary_dataflow_test.go`, `legacy_boundary_json_test.go`, `legacy_boundary_policy_test.go` (8 files — one more than the design's headline count since the evaluate/values split wasn't separately enumerated). `main.go`'s `runWithArchitectureFS` no longer calls `checkLegacyBoundary`; the `activity_log` boundary check (a separate, unrelated architecture rule in the same file) is untouched. `main_test.go`'s legacy-gateway-boundary test cases and the `legacy`-specific case in `TestRunAllowsNonLegacyAndApprovedGatewayFiles` were removed (replaced by a smaller `TestRunAllowsGeneratedFiles`); `walker_test.go`'s symlink-traversal test was rewired to use an `activity_log` violation as its proof signal instead of a legacy-DTO violation, since walker correctness is independent of which check produces the violation. No separate "gate list" exists to deregister from — `lefthook.yml`'s `architecture` step already just runs `go run ./tools/checkarchitecture`, which keeps working (activity_log check only) after the legacy_boundary call is removed from `main.go`.
- [x] D2.2 Retire `openspec/specs/{anime-legacy-raw,legacy-gateway,anime-snapshot-parser,append-only-safe-writer,windows-resilient-file-watcher}/spec.md`. **Deviation, deliberate:** per `~/.claude/skills/sdd-archive/SKILL.md`'s documented convention (`REMOVED Requirements → Delete the matching requirement from main spec after recording Reason/Migration`, executed during archive's Step 2 spec-sync, not during apply), these living specs are NOT deleted in this apply run. Verified instead that all 6 corresponding delta specs under `openspec/changes/sdd-55-legacy-breakup/specs/` (`anime-legacy-raw`, `anime-snapshot-parser`, `append-only-safe-writer`, `legacy-gateway`, `windows-resilient-file-watcher`, `writeback` — one more than the design's 5, since `writeback` is also fully retired) each contain a complete `## REMOVED Requirements` section with `**Reason**`/`**Migration**` notes per requirement, satisfying the archive-time merge precondition. `sdd-archive` will delete the corresponding `openspec/specs/*/spec.md` files (or remove only the matched requirements, if any requirement in those domains survives outside this change's delta) when it runs its Step 2 spec sync.
- [x] D2.3 Rewrite `README.md` and `AGENTS.md` mission to SQLite-only owner. `README.md`'s opening paragraph and Key Features rewritten: Bridge is now described as the sole owner of anime state in its embedded SQLite database, with a "Historical origin" paragraph noting the retired Legacy sync channel and that Legacy users get no synchronization from this version onward. `AGENTS.md`'s Project Context, Testing Rules, Language Policy, and Boundary Truths sections updated to drop `animes.dat`-as-source-of-truth framing and the "Legacy adapter" naming (now "retained storage-format codec"), while keeping every other rule (frontend constraints, file-size policy, pre-commit gate, Fallow, learning log) unchanged.
- [x] D2.4 Mark `docs/adr/007-english-code-spanish-boundaries.md` superseded; note retained storage-format Spanish keys. Added a superseded-status block pointing to the new `docs/adr/008-legacy-breakup-sqlite-sole-owner.md`, explaining boundary rule 1 ("Legacy adapter surface") still applies verbatim to `internal/anime/store` but for a different reason (byte-compat with Bridge's own existing rows, not an external Legacy file). Authored `docs/adr/008-legacy-breakup-sqlite-sole-owner.md` (next in the repo's `NNN-title.md` sequence after 007) capturing the cold-cut decision (channel removal, not codec removal), codec retention (ADR-55-3), the additive-vocabulary strategy (ADR-55-4), and the empty-boot decision (ADR-55-2).
- [x] D2.5 Update `CLAUDE.md` project notes that reference `animes.dat` as source of truth. Rule 7 (real fixture validation) repointed to `internal/anime/store/testdata`'s stored-shape fixtures; rule 13 (English-code policy) repointed from "legacy adapter surface" to "retained storage-format codec surface" with an ADR 008 cross-reference. Other rules (1-6, 8-12, 14-15) left unchanged — none referenced `animes.dat` or the Legacy adapter.

### Phase D3: Verify
- [x] D3.1 `go test ./...`, `golangci-lint run` (both `-Profile base` and `-Profile all`, matching `lefthook.yml`'s wired `-Profile all`), `go run ./tools/checkgofilesize` all green with `legacy_boundary` deregistered. Two gate regressions surfaced while running `-Profile all` and were fixed as part of Slice D coherence (not scope creep — the gate must stay green): (1) deleting `legacy_boundary.go` also removed `tools/checkarchitecture`'s only package-doc comment; restored it on `main.go`. (2) `internal/anime/store` (Slice B's relocated codec package) never got a package-doc comment when `legacy/doc.go` was deleted; added `internal/anime/store/doc.go`. (3) `internal/anime/editor_service_test.go` had grown to 411 effective lines across Slices A-C (dlinter's `file-length-limit` hard-fails at 400, stricter than `checkgofilesize`'s 500 ceiling) — split the publish-exactly-once and infrastructure-failure tests plus their helper types into a new colocated `internal/anime/editor_service_infrastructure_test.go`. Also: `scripts/lint.ps1` derives its package list from `git ls-files --cached --others`, so working-tree-only deletions (Slices A-C's uncommitted `legacy/`/watcher/parser deletions were never `git rm`'d, only deleted on disk) made it try to lint a nonexistent directory; ran `git add -A` to stage the full working tree (no commit made — per the orchestrator's "do not create branches/commits" instruction) so the lint script's file discovery matched reality.
- [x] D3.2 Write `verify-report.md` contrasting every spec scenario across all 4 slices with evidence; confirm archive readiness. **Deferred to the orchestrating agent per CLAUDE.md rule 3/AGENTS.md's Delegation and Verification Guardrails**: final verification and the `verify-report.md` MUST be produced by the orchestrator itself, not a sub-agent. This apply run leaves Slice D's code/docs changes ready for that step.

## Review Workload Forecast (per slice)

| Slice | Estimated changed lines | 400-line budget risk | Chained-PR recommendation | Decision needed before apply |
|---|---|---|---|---|
| A — Cut runtime channel | ~500-700 (deletion-heavy: 7+ files + tests, plus `app*.go` wiring edits) | High | Yes — own PR; request `size:exception` if deletions push past budget | No (auto-chain resolves it) |
| B — Relocate codec, delete file I/O | ~700-1000 (largest: 9-file relocation + deletion of `file_mutation`/`batch`/`batch_durability`/`parser`/`writer` + tests + `animes.dat` removal) | High | Yes — own PR; `size:exception` expected given deletion volume | No |
| C — Additive English-ification | ~200-350 (rename + read-time mapping + migration registry entry + openapi additive aliases) | Medium | Optional — likely fits in one PR without exception | No |
| D — Docs & governance | ~250-400 (linter deletion + 5 retired spec files + doc rewrites) | Medium-High | Yes — own PR; deletion-only specs are low review cost, `size:exception` optional | No |

Auto-chain delivery strategy resolves ordering without a pre-apply decision gate; each slice ships as its own stacked-to-main PR per the cached chain strategy. `size:exception` is pre-authorized for deletion-heavy slices (A, B, D) per the proposal/design.
