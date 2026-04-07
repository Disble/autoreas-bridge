# Design: SDD-01 Tracer Bullet Wiring

## Technical Approach

Implementar un tracer bullet encapsulado que demuestre la topología hexagonal sin introducir infraestructura real nueva. El wiring principal seguirá viviendo en `app.go` (equivalente práctico de `main.go` en este repo), donde se construirá el `events.Bus` y se inicializará un runner de tracer bullet con dummies de `anime`, `sync`, `device/websocket` y `system`.

## Architecture Decisions

### Decision: Encapsular el tracer bullet en un paquete dedicado

**Choice**: crear un paquete tipo `internal/tracerbullet` para concentrar runner, dummies y logging.
**Alternatives considered**: meter los dummies directo en `app.go`; crear dummies dentro de cada bounded context real.
**Rationale**: `app.go` ya tiene wiring real de SQLite + catch-up y no conviene contaminarlo; meter dummies en dominios reales ensucia el límite entre demo de arquitectura y comportamiento de negocio futuro.

### Decision: Reusar `AnimeChangedEvent` y el Event Bus real

**Choice**: usar `events.Bus` + `events.AnimeChangedEvent` en vez de inventar eventos especiales del tracer bullet.
**Alternatives considered**: evento nuevo solo para demo; llamadas directas entre dummies.
**Rationale**: el objetivo es probar el tronco real, no simular una demo paralela que esquive el bus. Llamadas directas derrotan la hipótesis arquitectónica completa.

### Decision: Logging inyectable, no stdout rígido

**Choice**: el runner recibirá una interfaz chica de logging/trace sink.
**Alternatives considered**: `fmt.Println` directo; assertions sobre logs globales del proceso.
**Rationale**: permite tests deterministas y evita side effects en runtime o verify.

## Data Flow

```text
App.startup / wiring equivalente
        |
        v
  events.NewBus()
        |
        +--> DummySync subscribes to anime.changed
        |
        +--> DummyWebSocket subscribes to anime.changed
        |
        +--> DummyAnimeService publishes AnimeChangedEvent
        |
        v
  Trace sink records:
  1) system: tracer bullet ready
  2) anime: publishing anime.changed
  3) sync: received anime.changed
  4) websocket: forwarding anime.changed
```

## Sequence Diagram

```text
System/App -> TraceRunner: Start()
TraceRunner -> DummySync: Subscribe(anime.changed)
TraceRunner -> DummyWebSocket: Subscribe(anime.changed)
TraceRunner -> DummyAnimeService: Emit sample change
DummyAnimeService -> EventBus: Publish(AnimeChangedEvent)
EventBus -> DummySync: AnimeChangedEvent
DummySync -> TraceSink: "sync received anime.changed"
EventBus -> DummyWebSocket: AnimeChangedEvent
DummyWebSocket -> TraceSink: "websocket forwarded anime.changed"
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app.go` | Modify | Integrar el runner del tracer bullet al wiring actual mediante seams chicos |
| `internal/tracerbullet/runner.go` | Create | Orquestación del tracer bullet y suscripciones iniciales |
| `internal/tracerbullet/logger.go` | Create | Interfaz o collector para trazas deterministas |
| `internal/tracerbullet/runner_test.go` | Create | TDD del flujo dummy Anime → Bus → Sync/WebSocket |
| `app_test.go` | Modify | Validar que el wiring principal crea/activa el tracer bullet sin romper startup |
| `openspec/changes/sdd-01-tracer-bullet-wiring/*` | Create | Artefactos del cambio |

## Interfaces / Contracts

```go
package tracerbullet

type TraceSink interface {
	Record(message string)
}

type Runner interface {
	Start()
}
```

Notas:
- El runner reusa `events.Bus`; no redefine `Publish/Subscribe`.
- Los dummies son internos al paquete y no se exponen como contratos de largo plazo.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Runner registra el recorrido completo del evento | `go test` sobre sink en memoria |
| Unit | Solo subscribers correctos reciben el evento dummy | Reusar/eventos reales y assertions de trazas |
| Unit | Wiring principal activa el runner sin romper bootstrap actual | Extender `app_test.go` con seams inyectables |
| Regression | Startup/cancel path de SDD-03 no regresa | Re-ejecutar tests existentes del root package |

## Migration / Rollout

No migration required.

## Open Questions

- [ ] Definir si el tracer bullet corre siempre al startup o solo bajo una flag/seam explícita para no ensuciar logs productivos.
- [ ] Decidir si el trace sink por defecto escribe a stdout o a un logger estándar del proyecto.
