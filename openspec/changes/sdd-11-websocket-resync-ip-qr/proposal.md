# Proposal: SDD-11 WebSocket Hub y Re-Sync Obligatorio

## Intent

Agregar sincronización en tiempo real basada en WebSocket para dispositivos ya pareados, priorizando conexión explícita por **IP local + QR/Token** sobre discovery multicast. El objetivo es que mobile pueda reconectar de forma confiable, asumir gap automáticamente y disparar `POST /api/sync/reconcile` antes de confiar en eventos nuevos.

## Scope

### In Scope
- Endpoint WebSocket autenticado para dispositivos pareados.
- Hub WS con register/unregister y broadcast de `AnimeChangedEvent`.
- Mensaje de control inicial `sync_required` al conectar o reconectar.
- Exposición de IP/puerto efectivo para consumo por pairing/UI/QR.
- Documentar mDNS como despriorizado y fuera del camino crítico.

### Out of Scope
- Replay por cursor o ack por dispositivo.
- Delivery garantizada o buffer duradero por cliente.
- Implementación completa de mDNS como discovery principal.
- UI final de Wails para mostrar QR/IP (queda en slices posteriores de frontend/system).

## Approach

Mantener el HTTP/WS dentro del adapter de red actual y agregar un hub desacoplado del Event Bus síncrono mediante colas internas no bloqueantes. Al conectarse, el cliente recibe un mensaje de control indicando `sync_required`, usando luego el endpoint REST ya existente `/api/sync/reconcile`. La dirección principal para mobile será IP/puerto efectivo; mDNS queda explícitamente relegado a experimento opcional futuro.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/` | Modified | Ruta WS, auth de handshake y wiring de realtime |
| `internal/realtime/` | New | Hub, client session y mensajes de control/evento |
| `app.go` | Modified | Wiring y lifecycle de hub realtime |
| `docs/` | Modified | Ajuste de estrategia discovery: IP/QR principal, mDNS opcional |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| El Event Bus síncrono se bloquee por clientes WS lentos | High | Hub con cola interna no bloqueante y fan-out desacoplado |
| Confiar en eventos sin resync tras microcortes | High | Mensaje obligatorio `sync_required` en cada conexión/reconexión |
| Intentar meter replay duradero en SDD-11 | Medium | Mantener el slice en protocolo de reconexión + broadcast simple |
| Reabrir dependencia en mDNS | Medium | Documentar explícitamente IP/QR como estrategia principal y dejar mDNS fuera de scope crítico |

## Rollback Plan

Revertir la ruta WebSocket y el hub realtime, conservando intactos los endpoints REST y el flujo manual por HTTP ya implementado en SDD-09/10.

## Dependencies

- `docs/sdd-tree.md`
- `internal/events/`
- `internal/api/`
- `openspec/specs/rest-api-middlewares-auth/spec.md`
- `openspec/specs/rest-api-write-sync/spec.md`

## Success Criteria

- [ ] Un dispositivo autenticado puede abrir `WS /ws` y recibir mensajes realtime.
- [ ] Cada conexión o reconexión recibe una instrucción explícita de `sync_required`.
- [ ] Un `AnimeChangedEvent` publicado en el bus se broadcastea a los clientes WS conectados.
- [ ] La ausencia de mDNS NO bloquea el flujo principal porque la conexión usa IP/puerto efectivo + QR/Token.
