# Tasks: SDD-00 Foundation

## Phase 1: Foundation

- [x] 1.1 Crear `.golangci.yml` con baseline conservadora para el repo Go.
- [x] 1.2 Agregar `modernc.org/sqlite` en `go.mod` y dejar explícita la decisión pure-Go en artefactos del cambio.
- [x] 1.3 Crear `internal/events/event.go` con `Event` y eventos base del tronco.
- [x] 1.4 Crear `internal/events/bus.go` con `Bus`, `Handler` y pub/sub en memoria.

## Phase 2: Strict TDD del Event Bus

- [x] 2.1 RED: escribir `internal/events/bus_test.go` para publish→subscribe de un evento conocido.
- [x] 2.2 GREEN: implementar la lógica mínima para que el subscriber reciba el evento publicado.
- [x] 2.3 RED: agregar test para fan-out a múltiples subscribers del mismo evento.
- [x] 2.4 GREEN: ajustar el bus para soportar múltiples handlers sin acoplamiento entre dominios.
- [x] 2.5 RED: agregar test para `unsubscribe` sin side effects sobre otros subscribers.
- [x] 2.6 GREEN/REFACTOR: cerrar la API del bus manteniendo contratos chicos y thread-safe.

## Phase 3: Verification

- [x] 3.1 Ejecutar `go test ./...` validando los escenarios del bus.
- [x] 3.2 Ejecutar `golangci-lint run` y ajustar la baseline si aparece ruido no esencial.
- [x] 3.3 Ejecutar `go vet ./...` para verificar contratos básicos y uso correcto del paquete.

## Phase 4: Wiring Readiness

- [x] 4.1 Revisar `main.go`; no hizo falta actualizarlo todavía para mantener el scope fundacional de SDD-00.
- [x] 4.2 Revisar que el cambio deje listo el camino para abrir `SDD-01` sobre contratos reales, no sobre stubs informales.

## Phase 5: Reopened Verify Gaps

- [x] 5.1 RED: agregar test que pruebe que `Publish` sin subscribers no panic.
- [x] 5.2 GREEN: validar que el bus ya soportaba ese guardrail sin cambios de producción.
- [x] 5.3 RED: agregar test que pruebe que subscribers de otro `eventName` no reciben eventos ajenos.
- [x] 5.4 GREEN: validar que el routing por nombre de evento ya era correcto sin cambios de producción.
- [x] 5.5 RED: agregar test para `unsubscribe()` idempotente (doble llamada segura).
- [x] 5.6 GREEN/REFACTOR: mantener el contrato del bus chico y estable con los nuevos guardrails.
- [x] 5.7 RED: crear `internal/sync/sqlite_driver_test.go` con smoke test que abra SQLite real con `modernc.org/sqlite` sin CGO.
- [x] 5.8 GREEN: agregar la dependencia real `modernc.org/sqlite` y validar el smoke test sin introducir infraestructura de `SDD-06`.
- [x] 5.9 Persistir evidencia TDD explícita de esta reapertura en el apply-progress.
- [x] 5.10 Re-ejecutar `go test ./...`, `golangci-lint run`, `go vet ./...` y actualizar verify.
