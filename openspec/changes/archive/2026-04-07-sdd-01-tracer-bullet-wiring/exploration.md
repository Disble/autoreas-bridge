## Exploration: sdd-01-tracer-bullet-wiring

### Current State
`internal/events` ya provee el tronco mínimo del Event Bus con contratos tipados y tests verdes de publish/subscribe. El scaffold de Wails dejó de ser puro starter: `app.go` hoy bootstrappea SQLite, resuelve `animes.dat`, crea el bus y dispara el catch-up async de `SDD-03`. Sin embargo, todavía NO existe el tracer bullet explícito pedido por `docs/sdd-tree.md`: no hay cuatro dominios dummy instanciados de forma intencional ni un recorrido observable del evento desde un dummy AnimeService hasta un dummy WebSocket pasando por el Bus.

### Affected Areas
- `app.go` — wiring actual del lifecycle; cualquier tracer bullet debe convivir con el arranque real ya existente y no romper `SDD-03`.
- `main.go` — hoy delega todo a `App`; el criterio del árbol menciona `main.go`, pero el repo ya usa `app.go` como wiring equivalente.
- `internal/events/` — contrato ya listo para reutilizar el evento `AnimeChangedEvent`.
- Nuevo paquete de tracer bullet (a definir) — dummies, runner y logger del recorrido.
- `app_test.go` y tests nuevos del tracer bullet — evidencia de wiring y de logs simulados sin depender de stdout global frágil.

### Approaches
1. **Crear un paquete dedicado de tracer bullet y conectarlo desde `App.startup`**.
   - Pros: mantiene el wiring aislado, testeable y no ensucia los bounded contexts reales con dummies temporales.
   - Cons: agrega una capa pequeña más antes de la implementación real de dominios.
   - Effort: Medium.

2. **Meter logs y dummies directo en `app.go`/`main.go`**.
   - Pros: menos archivos al principio.
   - Cons: mezcla lifecycle real, bootstrap SQLite y tracer bullet; después hay que desarmarlo o convivir con deuda técnica artificial.
   - Effort: Low-Medium.

### Recommendation
Ir con un paquete dedicado de tracer bullet, orquestado desde `app.go` como wiring equivalente de `main.go`. Reusar `events.Bus` y `events.AnimeChangedEvent`, modelando cuatro roles dummy (`anime`, `sync`, `device/websocket`, `system`) con logs inyectables. Así el cambio demuestra el flujo hexagonal sin invadir watcher, REST ni WebSocket real.

### Risks
- Si el tracer bullet se acopla al stdout global, los tests quedan frágiles y ruidosos.
- Si se toca demasiado `app.go`, se puede romper el catch-up async de `SDD-03` por accidente.
- Si se crean dummies dentro de paquetes de dominio permanentes, después cuesta distinguir código transitorio de código productivo real.

### Ready for Proposal
Yes — el alcance está claro: demostrar wiring inter-dominio observable sobre el Event Bus sin reemplazar el comportamiento real ya ganado en `SDD-02.5` y `SDD-03`.
