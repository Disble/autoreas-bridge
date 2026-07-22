# Design: SDD-56 English Canonical Vocabulary (Hard Cutover)

## Technical Approach

Rename every `snapshot_json` key to English in the storage codec (`internal/anime/store`), flatten the NeDB `$$date` wrapper to a plain epoch-millis integer, and rewrite every stored snapshot in place via a single marker-gated bootstrap migration. The live codec becomes English-only; a temporary migration-only Spanish rewriter bridges pre-cutover rows. `modified_at` (the mobile OCC token) is an integer and is never touched, so no client OCC state is invalidated. Delivered as 3 auto-chained slices per the proposal.

## Architecture Decisions

### Decision: Migration scope — 4 tables, not 2 (REQUIRED verification result)
The proposal flagged `anime_write_operations` and `conflicts` for verification. **Finding: both are transitively decode/wire-reachable and MUST be migrated**, plus a third table the proposal missed:

| Column | Reachability | Migrate? |
|--------|--------------|----------|
| `anime_snapshots.snapshot_json` | live codec decode | Yes (+ recompute `snapshot_hash`) |
| `changelog.snapshot_json` (non-null) | `MobileAnimeFromSnapshotForSync` → `/api/animes/changes` | Yes |
| `anime_write_operations.{base,desired}_snapshot_json` | `finalizeWriteOperation` copies `desired` verbatim into `anime_snapshots.snapshot_json` **and** `anime_changed_outbox.payload_json`; bootstrap `gateway.Recover` runs *after* migration, so a Spanish desired snapshot would poison the migrated table | Yes (+ recompute `base_hash`/`desired_hash`) |
| `conflicts.{local,remote}_snapshot_json` | `GET /api/conflicts` → `handleConflicts` → `ListConflicts` → `ConflictInfo.{Local,Remote}SnapshotJSON` served **verbatim** as raw bytes to REST consumers (same verbatim-byte reasoning as write_ops/outbox; no server-side decode) | Yes |
| `anime_changed_outbox.payload_json` (status='pending') | `ListPendingAnimeChanged` publishes verbatim to mobile | Yes |

None of these are decoded through the `AnimeRaw` codec *at storage time* (only `json.Valid` + byte hash) — they reach consumers as verbatim raw bytes: write_ops `desired` via the finalize→snapshot/outbox copy, outbox payloads via publish, and conflict snapshots via `GET /api/conflicts` (`decodeAnimeDomain` is a TEST-ONLY helper, not a production decoder). Excluding them would silently ship Spanish bytes to consumers after cutover.

### Decision: Migration mechanism
**Choice**: A `vocabulary_migrated_at` marker column on `anime_snapshots`, gating a one-shot pass in the `TableSchema.Migrate` hook (`ensureVocabularyMigration`, sibling to `ensureScheduleDayMigrationColumn`). The pass runs in ONE transaction across all 4 tables, using a private recursive key-rewriter (rename map + `{"$$date":n}`→`n` unwrap applied to top-level, `dias[]`, and `repetir[]` entries), re-serialized through the existing `marshalFields` (sorted-key) canonicalization so stored bytes equal future codec re-encodes; hashes recomputed with `anime.HashSnapshot`. Marker set last → idempotent; any failure rolls back the whole transaction (no partial state).
**Alternatives**: full-codec round-trip decode→re-encode (heavier, duplicates the codec); table rebuild-and-copy (`schema_migrations.go` pattern — unneeded, column shape unchanged).
**Rationale**: reuses the proven schedule-day marker pattern; content-only rewrite; transactional all-or-nothing.

### Decision: Temporary legacy decoder lifetime
The migration-only Spanish rewriter lives in `internal/sync` (migration file), NOT in the live codec. Retained one release cycle for reverse-migration safety, then deleted. The live `store` codec speaks English exclusively.

### Decision: `kind` / `sourceUrl` unification
`tipo`/`ContentType`/editor `Kind`(int) → canonical wire key **`kind`**; `pagina`/`SourceURL`/editor `Page` → **`sourceUrl`**. Domain field names (`domain.Anime.ContentType`, `.SourceURL`) stay Go-idiomatic; only json tags / snapshot keys unify. Editor DTO `AnimeEditorFrequentFields.Page` json tag `page`→`sourceUrl`; `Kind` already `kind`.

### Decision: PATCH stale-key handling — fail loud
**Choice**: A PATCH body whose only present recognized keys are superseded Spanish names (no recognized English field) returns **HTTP 400**, not a silent `200` no-op. `firstPresentField` dual-key decode is deleted; only English keys are recognized.
**Alternatives**: silent 200-noop (hides client bugs); accept-and-ignore Spanish (drags Legacy vocabulary forward).
**Rationale**: this is a breaking cutover — a client still sending Spanish is a real integration error that must surface, not be swallowed. Aligns with the spec amendment landing in parallel.

## Data Flow

    bootstrap: EnsureTableSchema(anime_snapshots)
        └─ Migrate → ensureVocabularyMigration
             ├─ marker present? → skip (idempotent)
             └─ BEGIN TX: rewrite snapshot_json/base/desired/local/remote/payload
                 (Spanish→English keys, $$date unwrap) + recompute hashes
                 → set vocabulary_migrated_at → COMMIT
    app start: gateway.Recover → Finalize copies English desired → anime_snapshots
    request:   GET/WS/changes → store.Decode (English-only) → English DTO

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/anime/store/{wire,mapper,create,editor_mutation,projection,wire_validation}.go` | Modify | English snapshot keys; drop `legacyDateWrapper`; `kind`/`sourceUrl` |
| `internal/anime/store/gateway*.go` | Modify | Propagate renamed keys in OCC/canonical paths |
| `internal/sync/schema_tables.go` + new `vocabulary_migration.go` | Modify/Create | `vocabulary_migrated_at` marker + 4-table content rewrite |
| `internal/api/contracts/{contracts,editor}.go` | Modify | English json tags on Mobile*/Legacy*/*Summary/editor DTOs |
| `internal/anime/mobile.go` | Modify | English DTO builders |
| `internal/api/handlers/{anime_handler,sync_handler}.go` | Modify | Delete `firstPresentField`; English-only PATCH decode; **fail-loud** on Spanish-only bodies |
| `docs/{openapi.yaml,sync-occ-mobile-contract.md}` | Modify | English wire + breaking notice |
| `docs/sdd-55-mobile-impact.md` | Replace | Breaking-change migration notice |

## Testing Strategy (STRICT TDD, `go test ./...`)

| Layer | What | Approach |
|-------|------|----------|
| Unit | English round-trip codec; `$$date` flatten | RED first in `store` `__tests__` |
| Migration | Idempotence (re-run no-op); zero-loss on a **cloned** real stored-shape fixture in `testdata` (never mutate `resources/autoreas-data`); hash recompute | new `vocabulary_migration_test.go` |
| Integration | changelog decode post-migration; conflicts/outbox English; **PATCH with Spanish-only keys → HTTP 400** (fail-loud) | handler + sync tests |
| Cleanup | delete SDD-55 dual-key alias tests | Slice 3 |

Per slice: `go test`, `golangci-lint run`, `go run ./tools/checkgofilesize` green; files ≤400 warn / ≤500 fail.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Data/vocabulary migration only.

## Migration / Rollout

Marker-gated one-shot at bootstrap; DB backup already taken (`.ignore/`). BREAKING wire change — Bridge commits on branch, deploy/flip gated on mobile shipping its English build in lockstep. Rollback: revert code (Spanish handling returns); rewritten rows need the retained legacy decoder for reverse-migration — safest rollback is not flipping the deploy.

## Open Questions

- None blocking. `anime_changed_outbox.payload_json` inclusion is a design addition beyond the proposal's stated 2-table verify scope; flagged to orchestrator.
