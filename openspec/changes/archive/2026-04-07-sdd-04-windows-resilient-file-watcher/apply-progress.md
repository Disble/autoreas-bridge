# Apply Progress: SDD-04 Windows-Resilient File Watcher

## Scope Applied

Implementación del watcher runtime resiliente para `animes.dat` observando el directorio padre, con filtrado por basename, debounce, retry loop y parseo/diff efectivo reutilizando `SDD-03`, más wiring en `app.go` para lifecycle de startup/shutdown.

## Safety Net Before Changes

- `internal/anime/startup_catchup_test.go` y `startup_catchup_integration_test.go` ya cubrían parser/diff/store de `SDD-03`, así que el watcher debía reusar esa lógica sin cambiar su contrato.
- `app_test.go` ya protegía startup SQLite, catch-up async, tracer bullet y shutdown cancelable.
- Se verificó que no existía ningún watcher previo en el repo antes de abrir `SDD-04`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1-2.2 filtro por basename | `internal/anime/watcher_test.go` | Unit | ✅ snapshot/runtime baselines | ✅ Written | ✅ Passed | ➖ Single guardrail | ✅ contrato `FileWatcher` + `DebounceTimer` |
| 2.3-2.4 debounce de bursts | `internal/anime/watcher_test.go` | Unit | ✅ first watcher slice | ✅ Written | ✅ Passed | ✅ write/create burst | ✅ una sola ruta de procesamiento |
| 2.5-2.6 retry loop ante error backend | `internal/anime/watcher_test.go` | Unit | ✅ watcher baseline | ✅ Written | ✅ Passed | ✅ backend 1 falla, backend 2 recupera | ✅ `serveLoop` + retry aislados |
| 3.1-3.2 publicación con parser/diff efectivo | `internal/anime/watcher_test.go` | Unit | ✅ parser/diff de SDD-03 | ✅ Covered by burst test | ✅ Passed | ✅ baseline old -> updated delta | ✅ reutilización explícita de `DiffSnapshots` |
| 3.3-3.4 atomic replace sin detachment | `internal/anime/watcher_integration_test.go` | Integration | ✅ watcher unit baseline | ✅ Written | ✅ Passed | ✅ rename + create + cambio posterior | ✅ helper de timeout realista para boundary FS |
| 4.1-4.2 wiring app lifecycle | `app_test.go` | Unit | ✅ startup/shutdown existing suite | ✅ Written | ✅ Passed | ✅ startup + shutdown paths | ✅ seams `newRuntimeWatcher` y wait en shutdown |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `internal/anime/watcher.go` | New | Runtime watcher con backend fs, debounce, retry y parseo efectivo |
| `internal/anime/watcher_test.go` | New | Unit tests de filtro, debounce y retry |
| `internal/anime/watcher_integration_test.go` | New | Integración real rename/create para no-detachment |
| `app.go` | Modified | Wiring del runtime watcher junto al catch-up existente |
| `app_test.go` | Modified | Startup/shutdown del watcher sin regresión |
| `go.mod` | Modified | Dependencia `github.com/fsnotify/fsnotify` |
| `go.sum` | Modified | Checksum de `fsnotify` |
| `openspec/changes/sdd-04-windows-resilient-file-watcher/tasks.md` | Modified | Checklist completo |
| `openspec/changes/sdd-04-windows-resilient-file-watcher/verify-report.md` | Modified | Resultado final de verify |

## Commands Executed

```text
go test ./internal/anime/... -run TestRuntimeWatcherIgnoresUnrelatedFilesInParentDirectory
go test ./internal/anime/... -run TestRuntimeWatcherCoalescesBurstEventsIntoSingleProcessingCycle
go test ./internal/anime/... -run TestRuntimeWatcherRecreatesBackendAfterWatcherError
go test ./internal/anime/... -run TestRuntimeWatcherDetectsAtomicReplaceAndKeepsListening -v
go test ./internal/anime/... ./... -run "Test(RuntimeWatcher|AppStartup|AppShutdown)"
go test ./...
golangci-lint run
go vet ./...
go test ./... -cover
```

## Outcome

- El bridge ahora puede detectar cambios runtime de `animes.dat` observando el directorio padre en lugar del archivo directo.
- El watcher reutiliza parser/diff efectivos de `SDD-03`, evitando falsos positivos por append-only line diffs.
- La integración real confirma que rename/remove/create no deja al watcher detached y que cambios posteriores siguen publicándose.
