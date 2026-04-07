# Proposal: SDD-01 Tracer Bullet Wiring

## Intent

Demostrar con una bala trazadora explícita que el tronco arquitectónico ya creado (`App` + Event Bus) puede conectar dominios desacoplados mediante un flujo observable, antes de seguir abriendo ramas funcionales más pesadas.

## Scope

### In Scope
- Instanciar cuatro roles dummy alineados al árbol (`anime`, `sync`, `device/websocket`, `system`).
- Reusar `internal/events.Bus` para simular el recorrido de un `AnimeChangedEvent`.
- Agregar un runner/logging observable que evidencie el flujo desde Dummy AnimeService hasta Dummy WebSocket.
- Integrar el tracer bullet al wiring actual sin romper el startup real existente.
- Cubrir el wiring con tests de Go, evitando depender solo de observación manual por consola.

### Out of Scope
- Implementar watcher/fsnotify real de `SDD-04`.
- Implementar WebSocket real, REST o mDNS.
- Reemplazar el catch-up real de `SDD-03` por dummies.
- Resolver todavía la totalidad del wiring final de producción entre todos los dominios reales.

## Approach

Agregar un paquete chico y testeable que modele el tracer bullet como un flujo dirigido por eventos. `App.startup` actuará como wiring equivalente a `main.go`: construye el bus, crea los dummies y dispara un recorrido simulado que deje trazas deterministas. La implementación debe convivir con el bootstrap SQLite y el catch-up async ya existentes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app.go` | Modified | Wiring equivalente para registrar/activar el tracer bullet sin romper startup actual |
| `main.go` | Maybe Modified | Solo si hace falta exponer mejor el startup/wiring, evitando scope creep |
| `internal/events/` | Reused | Contrato del Event Bus y `AnimeChangedEvent` |
| `internal/tracerbullet/` (o equivalente) | New | Dummies, runner y logger del recorrido |
| `app_test.go` | Modified | Cobertura del wiring del tracer bullet |
| `internal/tracerbullet/*_test.go` | New | TDD del flujo y del logging observable |
| `openspec/changes/sdd-01-tracer-bullet-wiring/` | New | Artefactos SDD del cambio |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Romper el startup real ya ganado en SDD-03 | Med | Mantener el tracer bullet encapsulado y activado desde seams testeables |
| Convertir el tracer bullet en deuda permanente | Med | Aislarlo en paquete dedicado y documentar su rol de wiring demo |
| Usar stdout global y volver los tests frágiles | High | Inyectar logger/collector y validar trazas en memoria |

## Rollback Plan

Revertir el paquete del tracer bullet y el wiring asociado en `app.go`/`main.go` si la demo agrega ruido operacional o interfiere con el lifecycle real. El Event Bus y SDD-03 deben quedar intactos tras el rollback.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `docs/tracer-bullet-plan.md`
- `openspec/specs/foundation/spec.md`
- Código actual de `app.go` e `internal/events/`

## Success Criteria

- [ ] Existen cuatro roles dummy claramente instanciados desde el wiring de la aplicación.
- [ ] Un `AnimeChangedEvent` simulado recorre Dummy AnimeService → Event Bus → Dummy Sync → Dummy WebSocket.
- [ ] La evidencia del recorrido es observable de forma determinista (logs o collector inyectado) y está cubierta por tests.
- [ ] El startup real de `SDD-03` sigue funcionando sin regresiones por el agregado del tracer bullet.
