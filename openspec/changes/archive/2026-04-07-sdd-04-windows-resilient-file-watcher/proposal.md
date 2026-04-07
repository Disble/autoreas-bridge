# Proposal: SDD-04 Windows-Resilient File Watcher

## Intent

Agregar observación runtime de `animes.dat` robusta para Windows, de modo que el bridge deje de depender solo del catch-up de arranque y pueda reaccionar a cambios posteriores sin quedarse sordo ante reemplazos atómicos del archivo legacy.

## Scope

### In Scope
- Implementar un watcher que observe el directorio padre de `animes.dat`, no el archivo directo.
- Filtrar eventos por nombre `animes.dat`.
- Introducir debouncer para coalescer ráfagas de eventos del mismo guardado.
- Introducir retry/recovery loop para mantener el watcher vivo ante errores del backend o recreaciones del archivo.
- Reusar parser + diff efectivos ya definidos en `SDD-03` para publicar `AnimeChangedEvent`.
- Integrar el watcher al lifecycle de `app.go` sin romper startup/shutdown actuales.
- Cubrir rename/remove/create con tests de integración usando filesystem temporal real.

### Out of Scope
- Writer append-only y deduplicación self-echo de `SDD-05`.
- Cambios en REST, WebSocket, changelog SQLite o reconciliación.
- Rehacer el catch-up de arranque ya implementado en `SDD-03`.

## Approach

Crear una pieza dedicada de runtime watching dentro de `internal/anime` que combine:
- adapter al backend de filesystem,
- filtro por basename,
- debouncer,
- parseo/diff reutilizando snapshots efectivos,
- publicación de deltas al Event Bus.

La integración con `app.go` debe ser incremental: primero bootstrap/catch-up, luego watcher en vivo. El watcher debe poder detenerse limpiamente en shutdown.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/` | New/Modified | Watch service, backend interfaces, tests de integración y posibles helpers de diff/runtime |
| `app.go` | Modified | Wiring del watcher junto al catch-up existente |
| `app_test.go` | Modified | Verificar que startup/shutdown manejan también el watcher |
| `go.mod` | Maybe Modified | Dependencia `fsnotify` si se adopta como backend concreto |
| `openspec/changes/sdd-04-windows-resilient-file-watcher/` | New | Artefactos del cambio |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Quedar detached tras atomic replace | High | Observar directorio padre y filtrar por basename |
| Parseos redundantes por ráfagas de eventos | High | Debouncer explícito y tests que simulen bursts |
| Mezclar demasiado runtime watcher con startup catch-up | Med | Mantener componentes separados, compartiendo solo parser/diff/store/event bus |
| Introducir dependencia de infraestructura difícil de testear | Med | Diseñar seams pequeñas para backend, logger y timer |

## Rollback Plan

Revertir el watcher runtime y su wiring en `app.go`, dejando intacto el catch-up de `SDD-03`. El sistema volvería al modo actual de solo reconciliación al arranque.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `openspec/specs/anime-snapshot-parser/spec.md`
- `internal/anime/parser.go`
- `internal/anime/startup_catchup.go`

## Success Criteria

- [ ] El watcher observa el directorio padre de `animes.dat`, no el archivo directo.
- [ ] Un replace atómico (`rename/remove + create`) de `animes.dat` sigue siendo detectado sin detachment.
- [ ] Ráfagas de eventos del mismo guardado se coalescen mediante debouncer.
- [ ] Los cambios runtime reutilizan el parser/diff efectivo y publican `AnimeChangedEvent` correctos.
- [ ] El lifecycle de la app arranca y apaga el watcher sin regresiones sobre `SDD-03`.
