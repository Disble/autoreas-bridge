# Proposal: SDD-55 Legacy Breakup (Full Cold Cut)

## Intent

Bridge's product mission is a "synchronization bridge" that reads and writes the running Legacy Delphi app's `animes.dat` live (fsnotify watcher, startup catch-up, SDD-48 ownership arbitration, byte-compat gateway). The user decided to sever ALL Legacy coupling via a FULL COLD CUT: delete every byte of `animes.dat` parsing/watching/writeback, keep existing Bridge SQLite data as-is, and provide NO import tool and no way to ever pull from Legacy again. Bridge stops being a bridge and becomes the sole owner of its data (SQLite-only). This is a mission pivot, not a refactor.

## Scope

### In Scope
- Stop and delete the runtime Legacy channel: fsnotify watcher, `startup_catchup`, `snapshot` reconcile, and SDD-48 ownership arbitration (`bridge_native_registry`, `restore_bridge_native`) with their tests.
- Delete the `internal/anime/legacy/` package (~28 files) and the `LegacyAnimeRaw`/byte-compat adapter surface.
- Remove the `resources/autoreas-data/animes.dat` fixture and ~50+ legacy-format compat tests.
- English-ify remaining Spanish DB/wire literals (`spanishWeekdayNames`, `nrocapvisto`/`estado`/`activo`) via ADDITIVE migrations; coordinate mobile wire renames through `docs/openapi.yaml`.
- Rewrite mission docs (README, AGENTS.md), supersede ADR-007, retire the `tools/checkarchitecture/legacy_boundary*` linter, and archive obsolete legacy specs.

### Out of Scope
- Changes to the Legacy Delphi app itself.
- Any data loss or migration of existing Bridge SQLite state.
- Mobile repo (`autoreas-mobile`) code — coordinated but not edited here.
- Runtime Spanish UI copy and ADR-007 user-data literals ("Ver hoy" etc.) that remain valid product vocabulary.

## Capabilities

### New Capabilities
- `bridge-native-persistence`: Bridge is the sole owner of anime state in SQLite — no external source of truth, no reconcile, no ownership arbitration.

### Modified Capabilities
- `openapi`: legacy wire field names English-ified (additive/coordinated with mobile).
- `episode-vocabulary`: absorb remaining Spanish day/status literals into English domain terms.

### Retired Capabilities (delta = full removal)
- `anime-legacy-raw`, `legacy-gateway`, `anime-snapshot-parser`, `append-only-safe-writer`, `windows-resilient-file-watcher`, `writeback`.

## Approach

Deliver as 4 auto-chained slices (400-line review budget; deletion-heavy slices may need `size:exception`):
- **A** — Cut the runtime channel: remove watcher/catchup/snapshot/arbitration + wiring; Bridge boots SQLite-only.
- **B** — Delete `internal/anime/legacy/` + adapter surface + fixture + compat tests once A leaves them unreferenced.
- **C** — English-ify Spanish DB/wire literals with additive migrations; announce in `docs/openapi.yaml` for mobile.
- **D** — Docs/governance: rewrite mission, supersede ADR-007, retire `legacy_boundary` linter and legacy specs.

Each slice is independently shippable, verifiable, and revertible.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/watcher.go`, `startup_catchup.go`, `snapshot.go` | Removed | Runtime Legacy channel |
| `internal/anime/bridge_native_registry.go`, `restore_bridge_native.go` | Removed | SDD-48 ownership arbitration (no longer needed) |
| `internal/anime/legacy/**` (~28 files) | Removed | Byte-compat gateway/mapper/wire/outbox/batch |
| `internal/download/config/defaults.go` | Modified | Drop `spanishWeekdayNames`; English weekdays |
| `docs/openapi.yaml` | Modified | English wire fields; mobile announcement |
| `resources/autoreas-data/animes.dat` + legacy `*_test.go` | Removed | Legacy-format fixtures/tests |
| `tools/checkarchitecture/legacy_boundary*` | Removed | Boundary linter obsolete |
| `README.md`, `AGENTS.md`, `docs/adr/007-*.md`, legacy `openspec/specs/*` | Modified/Removed | Mission rewrite; ADR-007 superseded; specs retired |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Users still running Legacy silently lose sync | High (intended) | Product decision; document mission pivot in README so behavior is explicit |
| Deletion breaks unrelated code paths still importing legacy | Med | Slice A verifies boot/tests before Slice B deletion; compiler + `go test ./...` gate |
| Mobile app breaks on wire renames | Med | Additive migrations + `docs/openapi.yaml` announcement; coordinate before merge |
| Migration drops/renames SQLite columns and loses data | Med | ADDITIVE-only migrations; never drop existing columns in this change |
| Deletion slices exceed 400-line budget | Med | Deletion-only diffs are low review cost; request `size:exception` per slice |

## Rollback Plan

Each slice is a self-contained commit/PR reverted independently. No SQLite data is destroyed (additive migrations only), so reverting code restores prior behavior. To fully abandon: `git revert` slices D→A in reverse order; the untouched SQLite database and (if not yet deleted) legacy code return the bridge to its prior sync behavior. After Slice B merges, restoring live Legacy sync requires reverting B (code is in git history, not lost).

## Dependencies

- Coordinate `docs/openapi.yaml` wire renames with `autoreas-mobile` before Slice C merges.
- Slice ordering: B depends on A; D depends on A–C landing.

## Success Criteria

- [ ] Bridge boots and operates with zero references to `animes.dat` or `internal/anime/legacy/`.
- [ ] No fsnotify watcher, catch-up, or ownership-arbitration code remains.
- [ ] Existing Bridge SQLite data is intact and readable after all migrations (additive-only, verified).
- [ ] Spanish DB/wire literals replaced with English; `docs/openapi.yaml` updated and mobile announced.
- [ ] README/AGENTS.md describe Bridge as SQLite-only owner; ADR-007 marked superseded; `legacy_boundary` linter and legacy specs removed.
- [ ] `go test ./...`, `golangci-lint run`, and `go run ./tools/checkgofilesize` pass on every slice.
