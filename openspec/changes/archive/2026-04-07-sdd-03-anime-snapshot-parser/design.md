# Design: SDD-03 Anime Snapshot Parser

## Technical Approach

SDD-03 se implementa con tres piezas separadas: un parser puro de `animes.dat`, un coordinador de startup cancelable y un adapter SQLite chico para `anime_snapshots`. El coordinador espera sin bloquear el lifecycle de Wails, parsea el archivo cuando aparece, compara el baseline efectivo por `_id` contra SQLite, publica deltas retroactivos y reemplaza el baseline persistido incluyendo pruning de filas ausentes.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Canonicalización y hash | Para cada línea válida de anime, usar `domain.LegacyAnimeRaw` + `MarshalJSON()` como JSON canónico; hash `sha256(canonicalJSON)` | `domain.Anime`, hash de línea cruda, hash global del archivo | `Anime` pierde campos legacy y la línea cruda tiene ruido append-only; `MarshalJSON()` ya ordena claves y preserva opcionales reales. |
| Semántica de tombstone | `$$deleted:true` nunca genera snapshot actual; elimina `_id` del mapa efectivo | Tratar `activo=false` como delete; persistir tombstones como snapshots | Tombstone y “inactivo” son conceptos distintos en arquitectura y specs. |
| Delete retroactivo | Si un `_id` existe en SQLite y ya no existe en el baseline efectivo, publicar `events.AnimeChangedEvent{AnimeID:id, Payload:nil}` | No publicar delete; crear nuevo tipo de evento ahora | No adelantamos SDD-07 ni cambiamos `internal/events`; `Payload:nil` cierra la semántica mínima con el contrato real existente. |
| Pruning de baseline | El store hace `ReplaceBaseline(ctx, current, pruneIDs)` en una transacción: upsert actuales + delete ausentes | Solo upsert; truncate total | Solo upsert reemitiría deletes en cada arranque; truncate agrega riesgo innecesario. |
| Lifecycle startup | `App.startup` solo wirea dependencias y lanza el coordinador en goroutine con `context.WithCancel`; el loop hace `select` entre ticker y `ctx.Done()` | Polling inline en `startup`; watcher ya en SDD-03 | Wails no debe quedar bloqueado esperando el archivo fantasma, y SDD-04 todavía no entra. |

## Data Flow

```text
sequence
App.startup -> StartupCoordinator.StartAsync
StartupCoordinator -> Ticker/Clock: wait 5s while file missing
Ticker/Clock -> StartupCoordinator: tick or ctx.Done
StartupCoordinator -> SnapshotParser: Parse(file)
SnapshotParser -> StartupCoordinator: current snapshots + warnings
StartupCoordinator -> WarningLogger: warn per corrupt line
StartupCoordinator -> SnapshotStore: ListSnapshots()
StartupCoordinator -> Publisher: AnimeChangedEvent(payload) for create/update
StartupCoordinator -> Publisher: AnimeChangedEvent(nil payload) for delete
StartupCoordinator -> SnapshotStore: ReplaceBaseline(current, pruneIDs)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `internal/anime/parser.go` | Create | Parser streaming puro, BOM stripping, tombstones, warnings. |
| `internal/anime/startup_catchup.go` | Create | Coordinador async/cancelable del catch-up. |
| `internal/anime/snapshot.go` | Create | DTO canónico, hashing y diff de snapshots. |
| `internal/sync/anime_snapshot_store.go` | Create | Adapter SQLite para listar y reemplazar baseline. |
| `app.go` | Modify | Wiring de bus/store/coordinador y cancelación de lifecycle. |
| `main.go` | Modify | Hook de shutdown si hace falta para cancelar el worker. |
| `internal/anime/*_test.go` | Create | Tests RED/GREEN de parser, diff y startup async. |
| `internal/sync/*_test.go` | Modify/Create | Tests del store con SQLite real temporal. |

## Interfaces / Contracts

```go
type SnapshotRecord struct {
	AnimeID       string
	CanonicalJSON []byte
	Hash          string
}

type ParseWarning struct { Line int; Reason string }

type SnapshotParser interface {
	Parse(r io.Reader) (map[string]SnapshotRecord, []ParseWarning, error)
}

type SnapshotStore interface {
	ListSnapshots(ctx context.Context) (map[string]SnapshotRecord, error)
	ReplaceBaseline(ctx context.Context, current map[string]SnapshotRecord, pruneIDs []string) error
}
```

Contratos:
- el parser MUST ser puro: sin DB, bus ni filesystem policy;
- el coordinador MUST decidir polling, diff, publicación y pruning;
- el store MUST conocer solo SQLite y transacciones;
- `Payload:nil` en `AnimeChangedEvent` SHALL significar delete retroactivo en SDD-03.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | BOM, línea corrupta, línea larga, append-only por `_id` | readers sintéticos y asserts sobre mapa efectivo/warnings |
| Unit | `$$deleted` vs `activo=false` | casos dedicados con payload nil vs payload presente |
| Unit | hash estable | mismo raw semántico => mismo `sha256`; cambio real => hash distinto |
| Unit | startup no bloqueante/cancelable | fake ticker/clock, fake parser/store/publisher/logger |
| Integration | parser con fixture real | copia temporal de `resources/autoreas-data/animes.dat` |
| Integration | `ReplaceBaseline` | SQLite temporal con rows existentes, upserts y pruning verificado |
| Integration | catch-up end-to-end | bus en memoria + SQLite temporal + archivo temp |

## Migration / Rollout

No migration requerida. El primer catch-up exitoso puebla `anime_snapshots`; los siguientes arranques reutilizan y prunan ese baseline.

## Open Questions

- [ ] None.
