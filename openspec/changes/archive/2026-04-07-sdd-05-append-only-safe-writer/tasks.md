# Tasks: SDD-05 Append-Only Safe Writer

## Phase 1: Architecture Setup

- [x] 1.1 Diseñar el writer runtime serializado dentro de `internal/anime`.
- [x] 1.2 Definir registry de self-echo compartido entre writer y watcher.
- [x] 1.3 Elegir seams para file opener/writer y publisher del bus.

## Phase 2: Strict TDD — cola secuencial y confirmación

- [x] 2.1 RED: escribir test que pruebe que múltiples `AnimeUpdateRequestedEvent` se encolan y procesan en serie.
- [x] 2.2 GREEN: implementar worker único con escritura append-only mínima.
- [x] 2.3 RED: escribir test que pruebe publicación de `AnimeChangedEvent` tras append exitoso.
- [x] 2.4 GREEN: publicar confirmación inmediatamente después de cada write.
- [x] 2.5 REFACTOR: mantener API pequeña y sin mezclar watcher con writer.

## Phase 3: Strict TDD — self-echo y estrés realista

- [x] 3.1 RED: escribir test del registry de hashes que filtre solo payloads propios.
- [x] 3.2 GREEN: integrar self-echo registry entre writer y watcher.
- [x] 3.3 RED: escribir test de estrés con 50 eventos concurrentes verificando cero aperturas concurrentes del archivo.
- [x] 3.4 GREEN: cerrar implementación secuencial sobre filesystem.
- [x] 3.5 RED: escribir test/integración donde watcher vea el cambio del writer y lo descarte como self-echo.
- [x] 3.6 GREEN/REFACTOR: consolidar writer + watcher sin duplicar eventos.

## Phase 4: Wiring & Verification

- [x] 4.1 RED: extender `app_test.go` para verificar startup/shutdown del writer junto al watcher.
- [x] 4.2 GREEN: integrar writer runtime en `app.go`.
- [x] 4.3 Ejecutar `go test ./...`.
- [x] 4.4 Ejecutar `golangci-lint run`.
- [x] 4.5 Ejecutar `go vet ./...`.
- [x] 4.6 Revisar cumplimiento explícito contra `docs/sdd-tree.md` y esta spec antes de cerrar verify.
