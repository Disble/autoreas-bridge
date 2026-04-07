# Apply Progress: SDD-01 Tracer Bullet Wiring

## Scope Applied

Implementación del tracer bullet inicial de wiring con paquete dedicado `internal/tracerbullet`, trazas inyectables, flujo dummy encadenado sobre el Event Bus (`anime.changed` -> `sync.requested`) e integración en `app.go` sin romper el bootstrap SQLite ni el catch-up async ya existentes.

## Safety Net Before Changes

- `app.go` ya tenía cobertura de startup/shutdown por `TestAppStartupBootstrapsSQLite`, `TestAppStartupStoresSQLiteBootstrapError`, `TestAppStartupLaunchesAnimeCatchUpAsyncAfterSQLiteBootstrap` y `TestAppShutdownCancelsAnimeCatchUp`.
- `internal/events` ya estaba verificado por la suite de `bus_test.go`; no se modificó el bus.
- `go test ./...` pasó antes de introducir el nuevo paquete de tracer bullet.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1-2.2 flujo base del tracer bullet | `internal/tracerbullet/runner_test.go` | Unit | N/A (new package) | ✅ Written | ✅ Passed | ➖ Single path | ✅ `Runner` + `TraceSink` mínimos |
| 2.3-2.4 evento no relacionado no dispara websocket | `internal/tracerbullet/runner_test.go` | Unit | ✅ runner baseline | ✅ Written | ✅ Passed | ✅ unrelated event vs tracer path | ✅ flujo real encadenado `anime.changed -> sync.requested` para evitar orden implícito |
| 3.1-3.3 wiring principal integra tracer bullet | `app_test.go` | Unit | ✅ app startup baseline | ✅ Written | ✅ Passed | ✅ tracer runner + sqlite/catch-up coexistiendo | ✅ seams `newTracerBulletRunner` y `newTracerBulletSink` |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `internal/tracerbullet/runner.go` | New | Runner, `TraceSink` y dummies event-driven mínimos |
| `internal/tracerbullet/logger.go` | New | Sink por defecto a stdout |
| `internal/tracerbullet/runner_test.go` | New | Tests TDD del recorrido y guardrail de evento no relacionado |
| `app.go` | Modified | Wiring del tracer bullet mediante seams inyectables, compartiendo `events.Bus` |
| `app_test.go` | Modified | Test de coexistencia entre tracer bullet, sqlite bootstrap y catch-up async |
| `openspec/changes/sdd-01-tracer-bullet-wiring/tasks.md` | Modified | Tareas marcadas como completas |
| `openspec/changes/sdd-01-tracer-bullet-wiring/verify-report.md` | Modified | Evidencia final de verify |

## Commands Executed

```text
go test ./...
go test ./... -cover
go test ./internal/tracerbullet/... -cover
golangci-lint run
go vet ./...
```

## Outcome

- `SDD-01` ya demuestra un flujo observable de wiring sobre el Event Bus sin introducir watcher, REST ni WebSocket real.
- `app.go` ahora actúa explícitamente como wiring equivalente de `main.go`, coexistiendo con el arranque real ganado en `SDD-02.5` y `SDD-03`.
- Se corrigió una falsa suposición de orden entre subscribers hermanos modelando el recorrido como eventos encadenados, no como delivery ordenado por `map`.
