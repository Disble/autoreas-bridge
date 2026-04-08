# Tasks: SDD-09 REST API, Middlewares y Autenticación

## Phase 1: Architecture & Contracts

- [x] 1.1 Crear el change `sdd-09-rest-api-middlewares-auth` con proposal/spec/design/tasks alineados a `docs/sdd-tree.md` y al estado real del repo.
- [x] 1.2 Definir el contrato mínimo del dominio `internal/device` (pairing + auth) sin acoplarlo al adapter HTTP.
- [x] 1.3 Diseñar la superficie `internal/api` y la regla de precedencia `405 antes que 401` para rutas prohibidas.

## Phase 2: Strict TDD — Device/Auth domain

- [x] 2.1 RED: escribir tests del store SQLite para tablas `pairing_tokens` y `devices`, incluyendo consumo de token válido e invalidación de token inexistente/usado.
- [x] 2.2 GREEN: extender `internal/sync/sqlite_bootstrap.go` con el schema mínimo y crear `internal/device/sqlite_store.go`.
- [x] 2.3 RED: escribir tests del service para `PairDevice` y `AuthenticateToken` con fakes.
- [x] 2.4 GREEN: implementar `internal/device/service.go` con generación/persistencia de bearer token y validación de token.
- [x] 2.5 REFACTOR: mantener el dominio device chico, explícito y persistente.

## Phase 3: Strict TDD — HTTP adapter

- [x] 3.1 RED: escribir tests `httptest` que prueben `PATCH /api/animes/:id` sin token => `401 Unauthorized`.
- [x] 3.2 RED: escribir tests `httptest` que prueben `POST /api/animes` => `405 Method Not Allowed`.
- [x] 3.3 RED: escribir tests para `DELETE /api/animes/:id` => `405 Method Not Allowed`.
- [x] 3.4 RED: escribir tests para `POST /api/devices/pair` con payload inválido/JSON roto y con caso feliz.
- [x] 3.5 GREEN: implementar `internal/api/router.go`, `handlers_*.go` y `middleware_auth.go` cumpliendo el contrato HTTP mínimo.
- [x] 3.6 REFACTOR: dejar el router explícito, sin lógica de negocio de PATCH todavía.

## Phase 4: Wiring & Verification

- [x] 4.1 RED: extender tests de `app.go` para verificar que el server HTTP arranca y cierra junto al lifecycle existente.
- [x] 4.2 GREEN: integrar el server HTTP en `app.go` sin romper watcher/writer/recorder.
- [x] 4.3 Ejecutar `go test ./...`.
- [x] 4.4 Ejecutar `golangci-lint run`.
- [x] 4.5 Ejecutar `go vet ./...`.
- [x] 4.6 Redactar `verify-report.md` contrastando cada escenario de la spec con evidencia.

## Phase 5: Archive Readiness

- [x] 5.1 Verificar que el change tenga `proposal.md`, `design.md`, `tasks.md`, al menos una `spec.md` y `verify-report.md` con veredicto válido.
- [x] 5.2 Preparar promoción a `openspec/specs/` y archive solo después de verify en verde.
