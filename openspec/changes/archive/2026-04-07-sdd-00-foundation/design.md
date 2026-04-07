# Design: SDD-00 Foundation

## Technical Approach

Crear un “tronco” mínimo: baseline de lint, decisión explícita de SQLite pure-Go y paquete `internal/events` con contratos chicos. Esto prepara `SDD-01`, `SDD-02` y `SDD-06` sin mezclar todavía infraestructura pesada con el scaffold de Wails.

## Architecture Decisions

### Decision: SQLite pure-Go desde el inicio

**Choice**: usar `modernc.org/sqlite` como driver inicial.
**Alternatives considered**: `github.com/mattn/go-sqlite3`, `github.com/glebarez/sqlite`.
**Rationale**: `mattn/go-sqlite3` introduce CGO/GCC en Windows, chocando con el criterio de build del árbol. `glebarez/sqlite` también evita CGO, pero agrega una capa ORM-like sobre GORM que hoy NO necesitamos. `modernc.org/sqlite` deja la base más directa para `database/sql`.

### Decision: Event Bus minimalista y tipado

**Choice**: definir `Event` + `Bus` en `internal/events`, con publish/subscribe en memoria y eventos concretos en el mismo paquete.
**Alternatives considered**: bus genérico por strings, dependencia externa, wiring directo entre dominios.
**Rationale**: strings puros degradan seguridad de tipos; una librería externa mete complejidad antes de tiempo; wiring directo rompe la separación hexagonal.

## Data Flow

```text
Anime Domain ──publish──┐
Sync Domain  ──subscribe─┼──> internal/events.Bus
Device Domain──subscribe─┘

main.go construye el Bus y luego inyecta implementaciones reales o dummy.
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.golangci.yml` | Create | Baseline de lint para Go |
| `go.mod` | Modify | Agregar driver `modernc.org/sqlite` |
| `internal/events/bus.go` | Create | Interfaz `Bus`, implementación in-memory y contrato de subscripción |
| `internal/events/event.go` | Create | Tipos base de eventos y metadatos mínimos |
| `internal/events/bus_test.go` | Modify | Guardrails negativos: no subscribers, routing por nombre, unsubscribe idempotente |
| `internal/sync/sqlite_driver_test.go` | Create | Smoke test del driver `modernc.org/sqlite` con `database/sql` |
| `openspec/changes/sdd-00-foundation/*` | Create | Artefactos SDD del cambio |

## Interfaces / Contracts

```go
package events

type Event interface {
	Name() string
}

type Handler func(Event)

type Bus interface {
	Publish(Event)
	Subscribe(eventName string, handler Handler) (unsubscribe func())
}
```

Eventos concretos iniciales: `AnimeChangedEvent`, `AnimeUpdateRequestedEvent`, `SyncRequestedEvent`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Publish/subscribe, fan-out, no-subscriber, event routing y unsubscribe idempotente | `go test` table-driven en `internal/events/bus_test.go` |
| Integration | Apertura real del driver SQLite | `go test` con `database/sql` usando `modernc.org/sqlite` |
| Unit | Configuración de lint y compilación sin CGO | Verificación por comandos de quality gates del repo |
| Integration | No aplica en SDD-00 | Se difiere a `SDD-01` y `SDD-06` |

## Migration / Rollout

No migration required.

## Open Questions

- [ ] Confirmar si `AnimeChangedEvent` necesita snapshot completo desde SDD-00 o solo nombre + payload genérico.
- [ ] Decidir si la evidencia TDD histórica se reconstruye en un reporte nuevo o si solo se exige desde esta reapertura en adelante.
