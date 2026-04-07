# Tasks: SDD-01 Tracer Bullet Wiring

## Phase 1: Architecture Setup

- [x] 1.1 Crear el paquete dedicado del tracer bullet (`internal/tracerbullet/` o equivalente) sin contaminar bounded contexts reales.
- [x] 1.2 Definir un `TraceSink` chico e inyectable para registrar trazas deterministas del recorrido.
- [x] 1.3 Diseñar el runner para reusar `events.Bus` y `events.AnimeChangedEvent` sin inventar wiring paralelo.

## Phase 2: Strict TDD — recorrido dummy del evento

- [x] 2.1 RED: escribir test que espere la traza `system ready -> anime publish -> sync received -> websocket forwarded`.
- [x] 2.2 GREEN: implementar la mínima lógica del runner y dummies para satisfacer el flujo completo.
- [x] 2.3 RED: agregar test que demuestre que el Dummy WebSocket solo reacciona a `anime.changed`.
- [x] 2.4 GREEN: ajustar suscripciones y trazas manteniendo el Event Bus como único canal inter-dominio.
- [x] 2.5 REFACTOR: mantener los dummies encapsulados y la API del tracer bullet mínima.

## Phase 3: Strict TDD — wiring principal

- [x] 3.1 RED: extender `app_test.go` para verificar que el wiring principal crea/activa el tracer bullet sin romper el startup actual.
- [x] 3.2 GREEN: integrar el runner en `app.go` usando seams inyectables y preservando el catch-up async de `SDD-03`.
- [x] 3.3 REFACTOR: simplificar wiring duplicado y dejar documentado por qué `app.go` actúa como `main.go` equivalente.

## Phase 4: Verification

- [x] 4.1 Ejecutar `go test ./...` cubriendo los tests nuevos y los existentes del root package.
- [x] 4.2 Ejecutar `golangci-lint run` verificando que el tracer bullet no introduce ruido innecesario.
- [x] 4.3 Ejecutar `go vet ./...` para confirmar contratos correctos del wiring.
- [x] 4.4 Revisar cumplimiento explícito contra `docs/sdd-tree.md` y esta spec antes de cerrar verify.
