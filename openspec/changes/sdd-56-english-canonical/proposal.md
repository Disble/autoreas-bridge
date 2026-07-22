# Proposal: SDD-56 English Canonical Vocabulary (Hard Cutover)

## Intent

SDD-55 severed Legacy interop and made Bridge's SQLite the sole canonical database, but it deliberately kept the NeDB-inherited **Spanish vocabulary** as the wire and storage format, adding only additive English PATCH aliases for 3 fields (`status`, `episodesWatched`, `days`). The read/DTO layer and the storage codec remain 100% Spanish (`nombre`, `nrocapvisto`, `estado`, `dias`, `fechaEstreno`, the NeDB `$$date` date wrapper, etc.).

This change performs a **HARD CUTOVER to English-only** vocabulary across storage, wire, and request layers, **superseding SDD-55's additive-alias approach**. Now that Bridge owns its data and is English-by-default (ADR-008, CLAUDE.md rule 13), keeping Spanish as co-equal wire/storage vocabulary is an obsolete Legacy inheritance. Spanish is removed entirely from field **names**; Spanish **data values** that are legitimate product vocabulary (weekday values like `"Lunes"`, status literals like `"Ver hoy"`) are preserved unchanged.

Success looks like: every `snapshot_json` key, response DTO json tag, and accepted PATCH key is English; existing SQLite rows (live and historical changelog) are migrated in place with zero data loss; the mobile breaking-change is documented and the deploy is coordinated in lockstep.

## Scope

### In Scope
- **Storage codec** (`internal/anime/store/{wire,mapper,create,editor_mutation,projection,wire_validation}.go`): rename all `snapshot_json` keys to English per the name map below.
- **One-shot idempotent content migration**: add a `vocabulary_migrated_at` marker column gating a one-shot content-rewrite pass, reusing the `schedule_day_migrated_at` marker pattern in `internal/sync/schema_tables.go`. Migrates **both** `anime_snapshots.snapshot_json` (live) **and** non-null `changelog.snapshot_json` (historical, decoded by `MobileAnimeFromSnapshotForSync` to serve `/api/animes/changes`). Runs synchronously in the `TableSchema.Migrate` bootstrap hook (proven to run before any handler/gateway touches the DB). Keeps a **temporary private legacy-Spanish decoder** used ONLY by the migration, removed the following cycle.
- **Response DTOs** (`internal/api/contracts/contracts.go` — `MobileAnime`, `MobileRepeticion`, `MobileAnimeDay`, `LegacyAnimeSummary`, `AnimeChangeSummary`; `internal/anime/mobile.go`; websocket payloads): English json tags.
- **PATCH request cutover** (`internal/api/handlers/anime_handler.go`): DELETE the SDD-55 `firstPresentField` dual-key logic; accept English keys only. Includes `sync_handler` patch decode and the season rating handler.
- **NeDB `$$date` wrapper flattening**: replace the `{"$$date": <epoch-ms>}` wrapper (`legacyDateWrapper`, `wire.go`) with a plain epoch-millis integer. Bundled into this single breaking release to avoid a second future break. (Explicit, user-vetoable scope inclusion.)
- **Naming-drift cleanup**: unify one canonical name per concept across storage/wire/domain — `tipo`/`ContentType`/editor `kind` → **`kind`**; `pagina`/`SourceURL`/editor `page` → **`sourceUrl`**. (Explicit in-scope cleanup.)
- **Docs**: update `docs/openapi.yaml` and `docs/sync-occ-mobile-contract.md`; **replace** `docs/sdd-55-mobile-impact.md` with a BREAKING-CHANGE migration notice for mobile.

### Out of Scope
- No data loss — this is a vocabulary rename that preserves all values.
- Spanish UI copy and runtime data literals (`"Sin ver"`, `"Ver hoy"`, `"Visto"`, `"No me gusto"`, weekday values `"Lunes"`…) stay Spanish per ADR-007/CLAUDE.md rule 13. Only field **names** change.
- No change to the Legacy Delphi app.
- No change to `autoreas-mobile` code — coordinated in lockstep, not edited here.
- `anime_write_operations.{base,desired}_snapshot_json` and `conflicts.{local,remote}_snapshot_json`: NOT migrated unless design confirms they are decode-reachable through the `AnimeRaw` codec (explore indicates they are compared/stored as raw bytes for OCC/hash). Design must verify before excluding.

## English Name Map (field NAMES only; VALUES unchanged)

| Spanish | English |
|---------|---------|
| `_id` | `id` |
| `nombre` | `name` |
| `nrocapvisto` | `episodesWatched` |
| `estado` | `status` |
| `activo` | `active` |
| `primeravez` | `firstCycle` |
| `dias` | `days` |
| `dia` | `day` |
| `orden` | `order` |
| `fechaCreacion` | `createdAt` |
| `fechaEstreno` | `premieredAt` |
| `fechaUltCapVisto` | `lastWatchedAt` |
| `fechaEliminacion` | `deletedAt` |
| `totalcap` | `totalEpisodes` |
| `duracion` | `durationMinutes` |
| `tipo` | `kind` |
| `pagina` | `sourceUrl` |
| `carpeta` | `folder` |
| `origen` | `origin` |
| `estudios` | `studios` |
| `generos` | `genres` |
| `portada` | `cover` |
| `repetir` | `repetitions` |
| `numrepeticion` | `numRepetitions` |
| `fechaRepeticion` | `repeatedAt` |

Note: `dias[].dia` (weekday) VALUE stays Spanish (`"Lunes"`), already read-time-translated in `internal/download/service_selection.go`. Only the wrapping keys `dias`/`dia` rename to `days`/`day`.

## Capabilities

### Modified Capabilities
- `bridge-native-persistence`: storage codec speaks English; snapshot_json keys migrated in place.
- `openapi`: English wire vocabulary, Spanish **removed** — **BREAKING** (GET, WS, changelog, and PATCH all lose Spanish).
- `episode-vocabulary`: name-vs-value English-ification — field names English, data values preserved.
- `mobile-sync-contract` / `changelog-recorder`: `/api/animes/changes` feed serves English payloads; historical changelog snapshots migrated so they decode under the English-only codec.

## Approach

Deliver as **3 auto-chained, stacked-to-main slices** (400-line review budget; file-size warn 400/fail 500):

- **Slice 1 — Storage codec + one-shot migration**: rename `snapshot_json` keys to English (`wire.go`, `mapper.go`, `create.go`, `editor_mutation.go`, `projection.go`, `wire_validation.go`); flatten `$$date`; add `vocabulary_migrated_at` marker + content-rewrite pass over `anime_snapshots` and `changelog`; keep the temporary private legacy decoder for the migration only. Foundational rename — everything downstream depends on storage speaking English.
- **Slice 2 — Response DTOs + internal glue**: English json tags on `contracts.go` DTOs, `mobile.go` builders, and websocket payloads. Pure rename now that storage is English.
- **Slice 3 — PATCH request cutover + docs**: delete `firstPresentField` dual-key decode (English-only requests); `sync_handler` and season rating patch decode; update `docs/openapi.yaml` and `docs/sync-occ-mobile-contract.md`; replace `docs/sdd-55-mobile-impact.md` with a breaking-change migration notice.

The naming-drift cleanup (`kind`, `sourceUrl`) lands in Slice 1 (storage/domain) and propagates through Slices 2–3 (wire). Each slice is independently shippable, verifiable, and revertible. No transitional dual-read window is needed in the live codec because the migration runs first in bootstrap and covers every decode-reachable table.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/store/wire.go` | Modified | English keys; flatten `$$date` wrapper |
| `internal/anime/store/{mapper,create,editor_mutation,projection,wire_validation}.go` | Modified | English snapshot_json keys; `kind`/`sourceUrl` unification |
| `internal/sync/schema_tables.go` | Modified | `vocabulary_migrated_at` marker + one-shot content-rewrite migration |
| `internal/api/contracts/contracts.go` | Modified | English json tags on Mobile* / Legacy* / *Summary DTOs |
| `internal/api/contracts/editor.go` | Modified | Reconcile `kind`/`page` onto canonical `kind`/`sourceUrl` |
| `internal/anime/mobile.go` | Modified | Outbound DTO builders; historical changelog decode path |
| `internal/api/handlers/anime_handler.go` | Modified | Delete `firstPresentField` dual-key decode; English-only PATCH |
| `internal/api/handlers/sync_handler.go`, season rating handler | Modified | English-only patch decode |
| `docs/openapi.yaml`, `docs/sync-occ-mobile-contract.md` | Modified | English wire; breaking announcement |
| `docs/sdd-55-mobile-impact.md` | Replaced | Breaking-change migration notice for mobile |

## Delivery Risk (BREAKING — read before merge)

**This is a BREAKING wire change for `autoreas-mobile`.** Unlike SDD-55 (explicitly non-breaking, additive), this removes Spanish from **every** consumer-facing surface simultaneously: GET responses, WebSocket payloads, the `/api/animes/changes` changelog feed, and accepted PATCH request keys. Any mobile build still reading Spanish breaks the instant Bridge deploys.

- **Bridge builds and commits on a branch now, but the deploy/flip is gated on mobile shipping its English build in lockstep.** Merging code ≠ deploying; do not flip Bridge in production until mobile's English client is released.
- Per the "API consumers need doc announcements" convention, the `docs/openapi.yaml` update **and** the breaking-change notice replacing `docs/sdd-55-mobile-impact.md` are **mandatory** deliverables of Slice 3, not optional.
- The `$$date` flattening compounds the break — intentionally bundled here so mobile absorbs one breaking migration instead of two.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mobile breaks on wire cutover | High (intended) | Coordinate lockstep deploy; breaking notice + openapi update; gate Bridge flip on mobile release |
| Historical `changelog.snapshot_json` rows fail to decode post-cutover | High if unmigrated | Migration covers `changelog` too, runs in bootstrap before any decode |
| Migration misses a decode-reachable table | Med | Design verifies `anime_write_operations`/`conflicts` decode-reachability before excluding |
| Migration corrupts/loses row content | Med | Idempotent marker-gated one-shot; temporary legacy decoder round-trips values; verify on real fixture before merge |
| Naming-drift unification introduces a domain regression | Med | `kind`/`sourceUrl` unified in Slice 1 with tests before wire propagation |
| Slice exceeds 400-line review budget | Med | 3-slice split; request `size:exception` per slice if needed |

## Rollback Plan

Each slice is a self-contained commit/PR revertible independently (Slice 3 → 2 → 1). The migration is a **content rewrite, not a schema drop** — no columns removed, values preserved. If a rollback is needed after Slice 1 ships, reverting the code restores Spanish key handling, but rows already rewritten to English keys would then be Spanish-expected: therefore the temporary private legacy decoder is retained for one release cycle so a reverted codec can still be paired with a reverse-migration if ever required. Do not delete the legacy decoder until one clean release cycle confirms no rollback need. Because the deploy is gated on mobile lockstep, the safest rollback is not flipping the deploy until mobile is ready.

## Dependencies

- Coordinate `docs/openapi.yaml` cutover with `autoreas-mobile` **before** deploy (not merge).
- Slice ordering: 2 depends on 1 (storage must speak English before DTOs); 3 depends on 2.
- Design phase must confirm `anime_write_operations`/`conflicts` snapshot columns are NOT decode-reachable before excluding them from the migration.

## Success Criteria

- [ ] Every `snapshot_json` key, response DTO json tag, and accepted PATCH key is English.
- [ ] `$$date` wrapper flattened to plain epoch-millis integers.
- [ ] `kind` and `sourceUrl` are the single canonical names across storage, wire, and domain.
- [ ] Existing SQLite rows (live `anime_snapshots` + historical `changelog`) migrated in place, decode successfully, zero data lost — verified on a real fixture.
- [ ] `firstPresentField` dual-key logic deleted; requests accept English only.
- [ ] `docs/openapi.yaml` and `docs/sync-occ-mobile-contract.md` updated; `docs/sdd-55-mobile-impact.md` replaced with a breaking-change notice.
- [ ] `go test ./...`, `golangci-lint run`, and `go run ./tools/checkgofilesize` pass on every slice.
- [ ] Spanish UI copy and data literals (`"Ver hoy"`, `"Lunes"`, …) unchanged.
