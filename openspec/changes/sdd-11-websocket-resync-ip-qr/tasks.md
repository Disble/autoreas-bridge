# Tasks: SDD-11 WebSocket Hub y Re-Sync Obligatorio

## Phase 1: Contracts & Discovery Strategy

- [x] 1.1 Documentar en las fuentes de arquitectura/plan que IP local + QR/Token es la estrategia principal y mDNS queda despriorizado. *(ya documentado en `docs/sdd-tree.md` y `docs/architecture.md`)*
- [x] 1.2 Definir contratos realtime mínimos (`sync_required`, evento anime cambiado, auth handshake WS).
- [x] 1.3 Diseñar el hub desacoplado del Event Bus síncrono para no bloquear publishers.

## Phase 2: RED — Failing Realtime Tests

- [x] 2.1 Agregar tests de handshake WS sin bearer => rechazo.
- [x] 2.2 Agregar test de conexión WS autenticada => recibe `sync_required` inicial.
- [x] 2.3 Agregar test de broadcast de `AnimeChangedEvent` a clientes conectados.
- [x] 2.4 Agregar test de unregister/reconnect sin fuga de clientes.

## Phase 3: GREEN — Minimum Implementation

- [x] 3.1 Implementar `internal/realtime/hub.go` con registro, unregister y fan-out no bloqueante.
- [x] 3.2 Implementar handler `WS /ws` autenticado y registro en hub.
- [x] 3.3 Suscribir el hub a `AnimeChangedEvent` usando el Event Bus actual.
- [x] 3.4 Exponer IP/puerto efectivo para que el flujo principal quede orientado a IP/QR.

## Phase 4: Verification

- [x] 4.1 Ejecutar `go test ./...`.
- [x] 4.2 Ejecutar `go vet ./...`.
- [x] 4.3 Ejecutar `golangci-lint run`.
- [x] 4.4 Redactar `verify-report.md` con evidencia del protocolo `sync_required` y broadcast WS.
