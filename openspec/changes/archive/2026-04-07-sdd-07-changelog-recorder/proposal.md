# Proposal: SDD-07 Changelog Recorder

## Intent

Persistir en SQLite todos los `AnimeChangedEvent` generados por catch-up, watcher y writer para que el dominio Sync tenga una bitácora `pending` sobre la cual construir reconciliación y entrega a dispositivos.

## Scope

### In Scope
- Definir la tabla `changelog` en SQLite si todavía no existe.
- Implementar un recorder en `internal/sync` que escuche `AnimeChangedEvent`.
- Persistir cada evento como registro `pending` en `changelog`.
- Integrar el recorder al lifecycle/wiring de la app.
- Cubrir el flujo con tests de Event Bus + SQLite real.

### Out of Scope
- Reconciliación CRDT (`SDD-08`).
- API HTTP/WS y delivery a dispositivos.
- Gestión de estados complejos de retries/acks remotos.

## Approach

Crear un `ChangelogRecorder` dedicado en `internal/sync` y un repositorio SQLite específico para `changelog`. El recorder se suscribe al Event Bus, traduce `AnimeChangedEvent` a filas SQLite con estado inicial `pending` y persiste sin depender del dominio Anime. El bootstrap de SQLite debe asegurar que la tabla exista antes de arrancar el recorder.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/sync/` | New/Modified | Repo de changelog, recorder, tests unitarios/integración |
| `app.go` | Modified | Wiring del recorder sobre el bus compartido |
| Bootstrap SQLite | Modified | Creación de tabla `changelog` |
| `openspec/changes/sdd-07-changelog-recorder/` | New | Artefactos del change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Acoplar Sync a detalles de Anime | Med | Persistir el evento como fat event de bus, no como internals de parser/writer |
| Tests SQLite demasiado permisivos | Med | Preferir integración con SQLite real usando el bootstrap ya existente |
| Schema improvisado difícil de extender | Med | Diseñar columnas mínimas pero explícitas para estado `pending` y payload |

## Rollback Plan

Revertir tabla `changelog`, recorder y wiring del recorder. Anime seguiría publicando eventos al bus sin persistencia Sync.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `internal/events/event.go`
- `internal/sync/anime_snapshot_store.go`
- SQLite bootstrap existente (`SDD-02.5`)

## Success Criteria

- [ ] Emitir `AnimeChangedEvent` en el bus inserta una fila `pending` en `changelog`.
- [ ] Catch-up, watcher y writer pueden seguir usando el mismo bus sin cambios de contrato.
- [ ] La tabla `changelog` existe y queda gestionada por el bootstrap SQLite.
- [ ] Wiring de la app inicia el recorder sin regresiones.
