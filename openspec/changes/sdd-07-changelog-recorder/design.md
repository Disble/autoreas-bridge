# Design: SDD-07 Changelog Recorder

## Technical Approach

Implementar un recorder dentro de `internal/sync` que se suscriba a `events.EventNameAnimeChanged`, transforme el evento en un registro de changelog y lo persista en SQLite con estado `pending`. La persistencia debe usar una tabla dedicada (`changelog`) creada durante el bootstrap de base, reutilizando la misma conexión ya configurada con WAL y `busy_timeout`.

## Architecture Decisions

### Decision: Recorder desacoplado del dominio Anime

**Choice**: el recorder escucha el Event Bus y persiste `AnimeChangedEvent` tal cual, sin conocer parser, watcher ni writer.
**Alternatives considered**: que Anime escriba changelog directo; hooks en `app.go`.
**Rationale**: el bus ya es el contrato inter-dominio. Saltarlo rompería el desacople ganado y complicaría `SDD-08`.

### Decision: Tabla `changelog` explícita con estado `pending`

**Choice**: agregar schema específico para bitácora pendiente.
**Alternatives considered**: reutilizar `anime_snapshots`; guardar solo en memoria.
**Rationale**: snapshots y changelog resuelven problemas distintos: baseline efectiva vs historial de propagación.

### Decision: SQLite real en tests de integración

**Choice**: validar inserts con SQLite real y el bootstrap del repo.
**Alternatives considered**: mocks de `ExecContext`/`DB`.
**Rationale**: SDD-06 ya advierte sobre semántica real de SQLite; los tests deben proteger esa frontera.

## Data Flow

```text
AnimeChangedEvent
   -> Event Bus
   -> ChangelogRecorder subscriber
   -> ChangelogStore.InsertPending(...)
   -> SQLite changelog row
```

## Sequence Diagram

```text
Anime domain -> EventBus: Publish(AnimeChangedEvent)
EventBus -> ChangelogRecorder: AnimeChangedEvent
ChangelogRecorder -> ChangelogStore: InsertPending(event)
ChangelogStore -> SQLite: INSERT INTO changelog (..., status='pending')
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/sync/changelog_store.go` | Create | SQLite repository for changelog rows |
| `internal/sync/changelog_store_test.go` | Create | SQLite integration tests |
| `internal/sync/changelog_recorder.go` | Create | EventBus subscriber / runtime recorder |
| `internal/sync/changelog_recorder_test.go` | Create | Recorder behavior tests |
| SQLite bootstrap files | Modify | Ensure `changelog` table exists |
| `app.go` | Modify | Wire recorder into app lifecycle |

## Interfaces / Contracts

```go
package sync

type ChangelogStore interface {
	InsertPending(ctx context.Context, event events.AnimeChangedEvent) error
}

type ChangelogRecorder interface {
	Start()
	Stop()
	Err() error
}
```

Notas:
- Los nombres exactos pueden variar, pero el recorder no debe necesitar dependencia hacia `internal/anime`.
- El payload del evento debe preservarse para reconciliación futura.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Recorder reacciona solo a `AnimeChangedEvent` | Event bus + store fake |
| Integration | Insert real en `changelog` con SQLite | DB real / temp DB |
| Regression | App wiring arranca recorder sin romper Anime lifecycle | extender `app_test.go` |

## Migration / Rollout

No migration beyond creating the `changelog` table in bootstrap.

## Open Questions

- [ ] Definir columnas mínimas del changelog para soportar reconciliación y delivery futuro (timestamps, payload, status, source).
- [ ] Decidir si el recorder debe ser completamente sync-on-publish o si conviene cola interna más adelante si el throughput del bus crece.
