# Apply Progress: SDD-05 Append-Only Safe Writer

## Scope Applied

Implementación del writer append-only seguro para `animes.dat`, con worker secuencial, registry MD5 de self-echo compartido con el watcher de `SDD-04`, confirmación inmediata por `AnimeChangedEvent` e integración en el lifecycle de `app.go`.

## Safety Net Before Changes

- `SDD-04` ya protegía watcher runtime sobre directorio padre y parseo/diff efectivo.
- `app_test.go` ya cubría startup/shutdown del catch-up, tracer bullet y watcher runtime.
- `internal/events` ya tenía el contrato `AnimeUpdateRequestedEvent` listo para reutilizar.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1-2.2 worker secuencial | `internal/anime/writer_test.go` | Unit | ✅ app/watcher baseline | ✅ Written | ✅ Passed | ✅ 50 concurrent events | ✅ `UpdateWriter` con worker único |
| 2.3-2.4 confirmación tras append | `internal/anime/writer_test.go` | Unit | ✅ writer queue baseline | ✅ Written | ✅ Passed | ➖ single success path | ✅ publish separado del append plumbing |
| 3.1-3.2 self-echo registry | `internal/anime/writer_test.go` | Unit | N/A (new registry) | ✅ Written | ✅ Passed | ✅ own vs foreign payloads | ✅ registry mínimo basado en MD5 |
| 3.3-3.4 estrés concurrencia | `internal/anime/writer_test.go` | Unit | ✅ queue baseline | ✅ Written | ✅ Passed | ✅ concurrent publisher burst | ✅ counter de concurrencia real |
| 3.5-3.6 watcher ignora self-echo | `internal/anime/writer_integration_test.go` | Integration | ✅ watcher runtime from SDD-04 | ✅ Written | ✅ Passed | ✅ append real + watcher reaction | ✅ integration crossing writer + watcher |
| 4.1-4.2 wiring app lifecycle | `app_test.go` | Unit | ✅ startup/shutdown suite | ✅ Written | ✅ Passed | ✅ startup + shutdown writer path | ✅ seams `newSelfEchoRegistry` y `newUpdateWriter` |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `internal/anime/self_echo.go` | New | Registry MD5 para self-echo |
| `internal/anime/writer.go` | New | Writer runtime append-only serializado |
| `internal/anime/writer_test.go` | New | Tests unitarios del registry, queue, confirmación y error path |
| `internal/anime/writer_integration_test.go` | New | Integración writer + watcher + append real |
| `internal/anime/watcher.go` | Modified | Self-echo filtering sobre deltas positivos |
| `app.go` | Modified | Wiring del self-echo registry y update writer |
| `app_test.go` | Modified | Startup/shutdown writer lifecycle |
| `openspec/changes/sdd-05-append-only-safe-writer/tasks.md` | Modified | Checklist completo |
| `openspec/changes/sdd-05-append-only-safe-writer/verify-report.md` | Modified | Resultado final de verify |

## Commands Executed

```text
go test ./internal/anime/... -run TestSelfEchoRegistryConsumesOnlyOwnPayloads
go test ./internal/anime/... -run TestUpdateWriterPublishesConfirmationAfterAppend
go test ./internal/anime/... -run TestUpdateWriterSerializesConcurrentEvents
go test ./internal/anime/... -run TestUpdateWriterAppendsOneLineAndWatcherIgnoresSelfEcho -v
go test ./... -run "Test(AppStartup|AppShutdown)"
go test ./...
golangci-lint run
go vet ./...
go test ./... -cover
go run ./tools/checksdd
```

## Outcome

- El bridge ahora puede persistir `AnimeUpdateRequestedEvent` en `animes.dat` usando append-only y un único worker de escritura.
- Cada append exitoso publica `AnimeChangedEvent` sin depender del watcher para la propagación local.
- El watcher de `SDD-04` consume el registry de self-echo para no duplicar eventos del propio writer.
- La app integra catch-up, watcher y writer en el mismo lifecycle sin regresiones visibles.
