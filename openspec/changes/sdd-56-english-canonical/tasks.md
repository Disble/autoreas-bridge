# Tasks: SDD-56 English Canonical Vocabulary (Hard Cutover)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400-1900 total across 3 slices |
| 400-line budget risk | High (Slice 1) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (codec + migration) → PR 2 (DTOs) → PR 3 (PATCH cutover + docs) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|------------------|-------------------|
| 1 | English codec + one-shot 4-table migration | PR 1 | `go test ./internal/anime/store/... ./internal/sync/...` | Boot against a cloned pre-cutover fixture DB in `testdata`; verify decode + hash recompute | Revert PR 1: codec/migration files restored from git history; DB rows already rewritten need retained legacy decoder for reverse-migration |
| 2 | English response DTOs + mobile builders | PR 2 | `go test ./internal/api/contracts/... ./internal/anime/...` | `GET /api/animes`, `/api/animes/changes`, WS payload manual inspection | Revert PR 2: contracts.go/mobile.go restored from git history, storage layer (PR 1) unaffected |
| 3 | PATCH English-only cutover + docs | PR 3 | `go test ./internal/api/handlers/... && go run ./tools/checkopenapi` | `PATCH /api/animes/{id}` with Spanish-only body → 400; English body → 200 | Revert PR 3: handler decode + docs restored; PRs 1-2 unaffected |

**Note**: the user-approved name map (memory #5855) renames `numrepeticion` → `numRepetitions`, correcting a stale `number` entry still present in `design.md`/`proposal.md`'s tables. All specs and this tasks file use `numRepetitions`; implementation MUST follow the approved map, not the stale design/proposal table.

## Slice 1: Storage Codec + One-Shot Migration

### Phase 1.1: RED (write first, `internal/anime/store` + `internal/sync`)
- [x] 1.1.1 Test: codec encodes new snapshot using only English keys (`wire_test.go`)
- [x] 1.1.2 Test: codec decodes English-keyed `snapshot_json` with no data loss
- [x] 1.1.3 Test: `dias[].dia` value stays `"Lunes"` under renamed `days`/`day` keys
- [x] 1.1.4 Test: single `kind` field round-trips editor → codec → editor
- [x] 1.1.5 Test: single `sourceUrl` field round-trips editor → codec → editor
- [x] 1.1.6 Test: non-null date field encodes as plain epoch-millis int, not `$$date`
- [x] 1.1.7 Test: absent date field encodes as `null`
- [x] 1.1.8 Test: fresh DB — migration sets marker, does zero rewrite work
- [x] 1.1.9 Test: existing `anime_snapshots.snapshot_json` rows rewritten, values unchanged
- [x] 1.1.10 Test: non-null `changelog.snapshot_json` rewritten; null rows untouched
- [x] 1.1.11 Test: staged `anime_write_operations` row rewritten before `gateway.Recover` finalizes it (no re-poisoning)
- [x] 1.1.12 Test: `conflicts.{local,remote}_snapshot_json` rewritten, served English via `GET /api/conflicts`
- [x] 1.1.13 Test: pending `anime_changed_outbox.payload_json` rewritten before publish
- [x] 1.1.14 Test: migration completes before any handler/gateway/worker's first decode
- [x] 1.1.15 Test: all 5 columns/4 tables rewritten in one transaction; injected failure rolls back entirely
- [x] 1.1.16 Test: re-running migration is a no-op (idempotence)
- [x] 1.1.17 Test: zero data loss on a cloned real fixture (clone into `testdata`, never mutate `resources/autoreas-data`) across all 5 columns
- [x] 1.1.18 Test: temporary legacy decoder is not imported/reachable from any live REST/WS/sync path
- [x] 1.1.19 Test: `snapshot_hash` recomputed via `anime.HashSnapshot` post-rewrite
- [x] 1.1.20 Test: `base_hash`/`desired_hash` recomputed for staged write ops
- [x] 1.1.21 Test: `modified_at` bit-identical before/after migration; OCC comparison still correct

### Phase 1.2: GREEN
- [x] 1.2.1 `wire.go`: English key vocabulary, drop `legacyDateWrapper`, flatten `$$date`
- [x] 1.2.2 `mapper.go`/`create.go`/`editor_mutation.go`/`projection.go`/`wire_validation.go`: English keys, unify `kind`/`sourceUrl`
- [x] 1.2.3 `internal/api/contracts/editor.go`: `Page` json tag → `sourceUrl`
- [x] 1.2.4 `internal/sync/schema.go`: add `vocabulary_migrated_at` column to `anime_snapshots` DDL
- [x] 1.2.5 Create `internal/sync/vocabulary_migration.go`: private recursive Spanish→English rewriter (top-level, `dias[]`, `repetir[]`) + `$$date` unwrap
- [x] 1.2.6 Wire `ensureVocabularyMigration` — called once from `initializeBridgeDB` after every `schemaTables()` entry is ensured (see deviation note below), single transaction across 4 tables
- [x] 1.2.7 Recompute `snapshot_hash`/`base_hash`/`desired_hash` via `anime.HashSnapshot`; leave `modified_at` untouched
- [x] 1.2.8 Re-serialize rewritten JSON (sorted-key canonical `json.Marshal` of the transformed generic value, see deviation note)

### Phase 1.3: Verify
- [x] 1.3.1 `go test ./...`
- [x] 1.3.2 `golangci-lint run` (base config + custom/advanced dlinter profile, both 0 issues)
- [x] 1.3.3 `go run ./tools/checkgofilesize` (passed)

### Deviations from design (apply-time corrections, both required for correctness)
- **Marker storage**: design said "`vocabulary_migrated_at` column on `anime_snapshots`, gating a one-shot pass". Implemented instead as a dedicated global `schema_migration_markers` table (single row, column still named `vocabulary_migrated_at`). A per-row column cannot safely gate a whole-database one-shot pass: `anime_snapshot_store.go`'s INSERT omits this column, so any row written *after* the migration ran (always English by construction) would default back to 0 and look "unmigrated" on the next boot, re-triggering the private Spanish decoder against already-English content. The `anime_snapshots.vocabulary_migrated_at` column is still added (additive, unused for gating — same non-functional-marker precedent as `schedule_day_migrated_at`) to satisfy the literal column-name requirement.
- **Invocation site**: design wired the migration into `TableSchema.Migrate` for `anime_snapshots`. `persistence.EnsureTableSchema` never calls `Migrate` for a table it just created via `CreateDDL` (fresh-install path), so that placement would silently skip the very-first bootstrap and only fire on the *second* boot of a brand-new database — by which point real, already-English rows created by normal use in between would be wrongly reprocessed (confirmed by a failing existing test before the fix). `ensureVocabularyMigration` is instead called once, unconditionally, in `initializeBridgeDB` right after every `schemaTables()` entry has been ensured (fresh-created or pre-existing), which is correct either way and still runs before `ensureDefaultHosterPriority` and any handler/gateway/recovery decode.
- Also added a no-op short-circuit: `migrateVocabularyJSON` reports whether it actually renamed/unwrapped anything; per-row `UPDATE`s (and hash recomputation) are skipped when a row is already fully English, avoiding needless byte-order churn from the sorted-map re-encode.

## Slice 2: Response DTOs + Mobile Builders

### Phase 2.1: RED (`internal/api/contracts`, `internal/anime`)
- [x] 2.1.1 Test: `MobileAnime`/`MobileRepeticion`/`MobileAnimeDay` serialize with English json tags only
- [x] 2.1.2 Test: `LegacyAnimeSummary`/`AnimeChangeSummary` serialize with English json tags only (proposal named DTOs do not exist; substituted with the real closest DTOs `AnimeListItem`/`AnimeHistoryItem`/`AnimeDetail`, per drift note above)
- [x] 2.1.3 Test: `mobile.go` builders emit English fields; historical migrated `changelog` rows decode and serve English via `/api/animes/changes` (covered by existing `internal/anime` suite plus new contract tests; no separate migrated-row fixture needed since Slice 1's migration already normalizes stored JSON before mobile.go ever decodes it)
- [x] 2.1.4 Test: no WS payload carrying anime field data emits a Spanish key (WS handlers only forward `MobileAnime`/`AnimeChange`, both covered by 2.1.1; verified no independent Spanish literal in `internal/api/handlers/websocket_handler.go`)

### Phase 2.2: GREEN
- [x] 2.2.1 `contracts.go`: English json tags across all Mobile*/Legacy*/*Summary DTOs (MobileAnimeDay, MobileRepeticion, MobileAnime, SyncingAnimeItem, AnimeListItem, AnimeHistoryItem, AnimeDetailContent, AnimeDetail, EpisodeScheduleItem, EpisodeCommandResult)
- [x] 2.2.2 `mobile.go`: update builders (incl. `MobileAnimeFromSnapshotForSync`) to English field names
- [x] 2.2.3 Update WS payload builders wherever anime field data is embedded (none needed beyond MobileAnime/AnimeChange, already covered)

### Phase 2.3: Verify
- [x] 2.3.1 `go test ./...`
- [x] 2.3.2 `golangci-lint run` (base `.golangci.yml` + advanced `.golangci.dlinter.yml`, both 0 issues)
- [x] 2.3.3 `go run ./tools/checkgofilesize`
- [x] 2.3.4 (added) `go vet ./...`, `bun run typecheck`, `bun run lint`, `bun run test` (frontend), `bun run filesize:warning` — all green after full Wails binding regeneration and frontend cascade

### Deviations from design/proposal (apply-time corrections)
- Proposal's `LegacyAnimeSummary`/`AnimeChangeSummary` DTO names do not exist in the codebase; the real closest analogues (`AnimeListItem`, `AnimeHistoryItem`, `AnimeDetail`) were renamed and tested instead, per the orchestrator's explicit instruction to ignore those stale proposal names.
- `EpisodeCommandResult.Estado`/`NroCapVisto` could not both become `Status`/`EpisodesWatched` because `Status` already exists on that struct (command outcome "ok"/"error"). Renamed to `AnimeStatus`/`EpisodesWatched` (json `animeStatus`/`episodesWatched`) instead, paired naturally with existing `AnimeID`/`AnimeName`.
- `contracts.AnimePatch`, `contracts.AnimeCreate`, `contracts.EffectiveAnime` (all in `services.go`) and internal-only parallel types (`anime.EpisodeScheduleItem`, `anime.EpisodeCommandResult`, `anime.ActivityAnimeSnapshot`, `season.AnimeCreateInput`, `contracts.OrderingCardDTO`, `season.domain.Placement`) were deliberately left Spanish: they are PATCH/request-path or internal-only mirrors explicitly out of Slice 2's response-DTO scope (Slice 3 or never-in-scope). Only their call sites reading now-renamed contracts fields were updated to keep `go build`/`go vet` green.
- Regenerating `frontend/wailsjs/go/models.ts` (`wails generate module`) surfaced a pre-existing Slice 1 drift: `internal/api/contracts/editor.go`'s `Page` field (json tag already `sourceUrl` since Slice 1) had never been propagated to the previously-stale generated bindings. Fixed as part of this slice's mandatory "backend + frontend both green" requirement.
- Frontend cascade also renamed the shared `Anime`/`AnimeDetail`/`AnimeRepeticion`/`AnimeHistoryEntry`/`SyncingAnime` wire-mirror types in `frontend/src/shared/contracts/*.types.ts` and every direct accessor across 20 feature/infrastructure files (listed in apply-progress). UI-local view-model output field names (e.g. `AnimeViewModel.nombre`, `HistoryRowViewModel.nombre`/`estado`, `AnimeFilterState.estado`/`activo`/`tipo`/`dia`) and Go-unrenamed local mirror types (`OrderingCard.dia`/`orden` in `season-source.types.ts`) were deliberately left Spanish since they mirror the correspondingly-unrenamed Go side, keeping the diff bounded to the actual wire-contract rename.
- Line-count forecast (350-500) undercounted the mandatory frontend/Wails-binding cascade; actual diff is larger (~154 files, ~1950 changed lines) because "backend DTO renames regenerate the Wails bindings and break the frontend" was called out as an explicit atomic-slice requirement, not an optional follow-up.

## Slice 3: PATCH Cutover + Docs

### Phase 3.1: RED (`internal/api/handlers`)
- [x] 3.1.1 Test: PATCH body with only stale Spanish keys → `400 Bad Request`
- [x] 3.1.2 Test: PATCH body with a recognized English key (even alongside a stale Spanish key) → `200 OK`, English field applied
- [x] 3.1.3 Test: PATCH body with a truly-unknown key (never Spanish or English) → silently ignored, no 400
- [x] 3.1.4 Test: `sync_handler` patch decode is English-only; Spanish-only body → 400
- [x] 3.1.5 Test: season rating handler patch decode is English-only (verified pre-existing no-op: `season_rating_handler.go` was already English-only; added `TestSeasonRatingRejectsSpanishKeys` confirming behavior)
- [x] 3.1.6 Test: `go run ./tools/checkopenapi` passes and doc describes the 400 response (rewrote the stale SDD-55 `TestPatchAnimeRequestBodyDocumentsEnglishAliasesAdditively` in `tools/checkopenapi/main_test.go` into `TestPatchAnimeRequestBodyDocumentsEnglishOnly`, since it asserted the old additive dual-key contract)

### Phase 3.2: GREEN
- [x] 3.2.1 `anime_handler.go`: delete `firstPresentField`; English-only decode for status/episodesWatched/days, fail-loud 400 on Spanish-only recognized keys
- [x] 3.2.2 `sync_handler.go`: English-only patch decode (transitively fixed via shared `decodeAnimePatch`/`decodeAnimePatchFields` in `anime_handler.go`; `sync_handler.go` itself required no changes)
- [x] 3.2.3 Season rating handler: English-only patch decode (verified no-op — already English-only, `DisallowUnknownFields` rejects any Spanish key as unrecognized)
- [x] 3.2.4 `docs/openapi.yaml`: English-only field docs on GET/WS/changelog/PATCH, document 400 response, dates documented as nullable int (`$$date` wrapper gone)
- [x] 3.2.5 `docs/sync-occ-mobile-contract.md`: update to English wire vocabulary
- [x] 3.2.6 Replace `docs/sdd-55-mobile-impact.md` with breaking-change notice (full name map, `$$date` flatten, `kind`/`sourceUrl` unification, lockstep-deploy guidance)

### Phase 3.3: Cleanup
- [x] 3.3.1 Delete SDD-55 dual-key alias tests (deleted `internal/api/handlers/anime_handler_english_alias_test.go`; its two tests exercised only English-key bodies despite the file name, so no unique coverage was lost — replaced/extended by the new `anime_handler_patch_english_cutover_test.go`)

### Phase 3.4: Verify
- [x] 3.4.1 `go test ./...` — all packages pass
- [x] 3.4.2 `golangci-lint run` (base profile via `powershell scripts/lint.ps1 -Profile base` → 0 issues; advanced/dlinter profile via `-Profile advanced` → 0 issues)
- [x] 3.4.3 `go run ./tools/checkgofilesize` — passed
- [x] 3.4.4 `go run ./tools/checkopenapi` — passed ("OpenAPI gate passed.")

### Deviations from design/proposal (apply-time corrections)
- `sync_handler.go` and `season_rating_handler.go` (tasks 3.2.2/3.2.3) required NO source changes: `sync_handler.go`'s `decodePendingOperationPatch` already delegates to the shared `decodeAnimePatch`/`decodeAnimePatchFields` in `anime_handler.go`, so fixing the shared decoder covers it transitively; `season_rating_handler.go` was already English-only (`anime_id`/`grade`/`rated_at` with `DisallowUnknownFields`). Both got a new/updated test proving the behavior rather than a code change.
- The stale-Spanish-key rejection is keyed per-concept (a map of deprecated Spanish key → English key), not a single anime-wide flag: `{"status":1,"estado":2}` succeeds (English wins, Spanish ignored) while `{"estado":1}` alone is a 400. This matches the orchestrator's explicit instruction and the task 3.1.2 wording.
- Found and fixed a stale SDD-55 assertion test in `tools/checkopenapi/main_test.go` (`TestPatchAnimeRequestBodyDocumentsEnglishAliasesAdditively`) that hard-asserted the additive Spanish+English dual-key openapi documentation contract; this would have permanently blocked `go test ./...` after the hard cutover. Replaced with `TestPatchAnimeRequestBodyDocumentsEnglishOnly`, which asserts the English keys ARE documented, the Spanish keys are NOT, and the 400 response documents the rename-rejection behavior.

## Review Workload Forecast (per slice)

| Slice | Estimated changed lines | 400-line budget risk | Chained-PR recommendation | Decision needed before apply |
|---|---|---|---|---|
| 1 — Codec + migration | ~600-800 (6 codec files + new migration file + ~20 RED tests + fixture) | High | Yes — own PR; `size:exception` pre-authorized (migration-heavy) | No |
| 2 — DTOs + builders | ~350-500 (contracts.go, editor.go, mobile.go, WS payloads + tests) | Medium | Optional — may fit unexceptioned | No |
| 3 — PATCH cutover + docs | ~400-600 (handler rewrite + 3 docs + test deletions) | Medium-High | Yes — own PR | No |

Auto-chain delivery strategy resolves ordering without a pre-apply gate; each slice ships as its own stacked-to-main PR. `size:exception` is pre-authorized for Slice 1 given migration volume.
