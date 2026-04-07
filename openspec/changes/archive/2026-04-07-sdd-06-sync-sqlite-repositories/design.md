# Design: SDD-06 Sync SQLite Repositories

## Technical Approach

SDD-06 no reabre el bootstrap de SDD-02.5 ni el recorder de SDD-07: los usa como base. El cambio endurece la frontera SQLite del dominio Sync con una única conexión física compartida para escritura (`database/sql` con `SetMaxOpenConns(1)` y `SetMaxIdleConns(1)`), contratos chicos propios del dominio Sync y repositorios cortos que retienen locks el menor tiempo posible. Así, el EventBus puede disparar múltiples goroutines sin multiplicar writers SQLite ni propagar `SQLITE_BUSY`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Control de concurrencia | Serializar writes en la frontera compartida de `*sql.DB`, no con mutex por repositorio | Confiar solo en WAL + `busy_timeout`; mutex local en cada store | WAL ayuda, pero SQLite sigue permitiendo un solo writer. `database/sql` puede abrir varias conexiones y aumentar contención. Un mutex por repo no cubre dos repos distintos del dominio Sync. |
| Contratos de repositorio | Usar DTOs/params chicos del dominio Sync (`ChangelogEntry`, futuros `ConflictRecord`, `SyncStateRecord`) y dejar `AnimeChangedEvent` como concern del adapter recorder | Firmas basadas en `events.AnimeChangedEvent`; pasar tipos de `internal/anime`; JSON genérico | Mantiene desacople del dominio Anime y deja la frontera reusable para futuras tablas sin mezclar EventBus con persistencia. |
| Estructura del paquete | Mantener archivos flat en `internal/sync` con un helper base compartido | Crear subpaquetes `repository/` y `db/` ahora | El repo ya usa package plano en `internal/sync`; seguir la convención reduce churn y evita sobrearquitectura temprana. |
| Locks y transacciones | Operaciones de una sola sentencia o transacciones breves por método | Transacciones largas, batching global, worker específico por repo | El riesgo principal es lock contention. Cuanto menos tiempo se retenga el writer lock, menor chance de `SQLITE_BUSY`, incluso con Autoreas Desktop o futuros repos compitiendo. |

## Data Flow

```text
goroutine x100
  -> EventBus publica/entrega AnimeChangedEvent
  -> ChangelogRecorder adapta evento a ChangelogEntry
  -> ChangelogRepository.InsertPending(ctx, entry)
  -> Shared Sync SQLite handle
  -> database/sql encola sobre 1 conexión abierta
  -> SQLite ejecuta INSERT con WAL + busy_timeout ya configurados
  -> commit
  -> siguiente write en cola
```

## Sequence Diagram

```text
Recorder#1..#100 -> ChangelogRepository: InsertPending(entry)
ChangelogRepository -> SyncSQLiteProvider: DB()
SyncSQLiteProvider -> database/sql: single physical connection
database/sql -> SQLite: INSERT INTO changelog (...)
SQLite -> database/sql: ok / wait up to busy_timeout if locked externally
database/sql -> ChangelogRepository: success
ChangelogRepository -> Recorder#1..#100: nil error
```

## File Changes

| File | Action | Description |
|---|---|---|
| `internal/sync/sqlite_bootstrap.go` | Modify | Mantener WAL/busy_timeout existentes y fijar límites del pool compartido para serializar writers. |
| `internal/sync/sqlite_bootstrap_test.go` | Modify | Cubrir el comportamiento endurecido del pool sobre DB real temporal. |
| `internal/sync/sqlite_store.go` | Create | Contrato base/herramienta compartida para repositorios SQLite del dominio Sync. |
| `internal/sync/changelog_store.go` | Modify | Adaptar el store a un contrato Sync-local y al provider compartido. |
| `internal/sync/changelog_store_test.go` | Modify | Agregar stress test de 100 inserts concurrentes con SQLite real. |
| `internal/sync/changelog_recorder.go` | Modify | Solo adaptar `AnimeChangedEvent` -> `ChangelogEntry`; no reescribir lifecycle ni responsabilidades. |
| `app.go` | Modify | Ajustar wiring mínimo si el contrato del store cambia. |

## Interfaces / Contracts

```go
type SyncSQLiteProvider interface {
	DB() *sql.DB
}

type ChangelogEntry struct {
	AnimeID string
	PayloadJSON []byte
	Status string
}

type PendingChangelogStore interface {
	InsertPending(ctx context.Context, entry ChangelogEntry) error
}
```

Reglas:
- los repositorios Sync MUST depender de la frontera SQLite compartida;
- el recorder SHALL traducir eventos a DTOs de Sync antes de persistir;
- ningún repositorio Sync debe importar `internal/anime`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit (RED) | Adaptación de `AnimeChangedEvent` a `ChangelogEntry` | fake repo y asserts sobre DTO, sin SQLite |
| Integration (RED/GREEN) | 100 inserts concurrentes sin `database is locked` | `go test` con temp DB file-backed real y `sync.WaitGroup` |
| Integration | El contrato reusable expone el mismo handle compartido de SQLite | usar provider/store sobre la misma DB real |
| Regression | Bootstrap sigue siendo idempotente y no rompe SDD-02.5 | rerun bootstrap tests existentes + nuevos asserts de pool strategy |

Strict TDD: primero test rojo del stress concurrente, luego el endurecimiento mínimo del provider, después refactor chico de contratos.

## Migration / Rollout

No migration required. Solo cambia la forma de acceder a la conexión SQLite ya existente.

## Open Questions

- [ ] None.
