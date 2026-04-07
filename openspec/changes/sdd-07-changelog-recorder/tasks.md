# Tasks: SDD-07 Changelog Recorder

## Phase 1: Architecture Setup

- [x] 1.1 Diseñar la tabla y el store de `changelog` en SQLite.
- [x] 1.2 Diseñar el recorder suscripto a `AnimeChangedEvent` sobre el bus.
- [x] 1.3 Definir el wiring mínimo en la app sin acoplar Sync con Anime internals.

## Phase 2: Strict TDD — store SQLite

- [x] 2.1 RED: escribir test de integración que pruebe inserción `pending` en `changelog`.
- [x] 2.2 GREEN: implementar `changelog_store.go` y schema necesario.
- [x] 2.3 REFACTOR: mantener schema y acceso SQL explícitos y chicos.

## Phase 3: Strict TDD — recorder sobre el bus

- [x] 3.1 RED: escribir test que pruebe que el recorder persiste al recibir `AnimeChangedEvent`.
- [x] 3.2 GREEN: implementar recorder y suscripción al bus.
- [x] 3.3 RED: escribir guardrail que pruebe que eventos no relacionados son ignorados.
- [x] 3.4 GREEN/REFACTOR: cerrar recorder con API mínima y sin filtrar comportamiento del dominio Anime.

## Phase 4: Wiring & Verification

- [x] 4.1 RED: extender `app_test.go` para verificar startup del recorder.
- [x] 4.2 GREEN: integrar recorder en `app.go`.
- [x] 4.3 Ejecutar `go test ./...`.
- [x] 4.4 Ejecutar `golangci-lint run`.
- [x] 4.5 Ejecutar `go vet ./...`.
- [x] 4.6 Revisar cumplimiento explícito contra `docs/sdd-tree.md` y esta spec antes de cerrar verify.
