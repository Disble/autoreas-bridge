# Proposal: SDD-06 Sync SQLite Repositories

## Intent

Consolidar la frontera SQLite compartida del dominio Sync, garantizando un acceso concurrente seguro sin errores `database is locked` (`SQLITE_BUSY`) y formalizando un contrato reusable para persistencia de changelog desacoplada del dominio Anime. Este cambio cubre el scope residual real de SDD-06 después de que SDD-02.5 cerró el bootstrap base y SDD-07 cerró el recorder del changelog.

## Scope

### In Scope
- Endurecer el uso compartido de la conexión SQLite ya existente dentro de `internal/sync` para tolerar alta concurrencia de escrituras.
- Definir un contrato chico reusable en `internal/sync` para repositorios SQLite del dominio Sync.
- Escribir test de estrés demostrando 100 inserciones concurrentes de `Changelog` sin arrojar error `SQLITE_BUSY`.
- Asegurar que la persistencia de changelog use tipos propios de Sync en lugar de `events.AnimeChangedEvent` o tipos de `internal/anime`.

### Out of Scope
- Lógica CRDT o reconciliación semántica (eso es SDD-08).
- Delivery de eventos a otros dispositivos o clientes.
- Reabrir decisiones de driver, path seguro UAC, o modo WAL (ya cerrados en SDD-02.5).
- Rediseñar el Event Bus o las responsabilidades funcionales del `changelog recorder` (ya cerrados en SDD-07).

## Approach

Partiendo de la base de datos configurada en SDD-02.5 (path UAC-safe, driver pure-Go, WAL y `busy_timeout`), se validará su comportamiento bajo carga concurrente extrema. Si ocurren bloqueos, se endurecerá la frontera compartida de `database/sql` dentro de `internal/sync` para serializar writers o reducir la contención sin redefinir el bootstrap base. En paralelo, se desacoplará el store de changelog de `events.AnimeChangedEvent` introduciendo un contrato Sync-local reusable para futuros stores del dominio (`ConflictStore`, `SyncStateStore`) sin crear subpaquetes nuevos ni reabrir SDD-07 más allá de una adaptación mínima de entrada si hiciera falta.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/sync/sqlite_bootstrap.go` | Modified | Endurecimiento mínimo del pool/handle compartido de SQLite |
| `internal/sync/sqlite_store.go` | New | Contrato reusable y tipos Sync-only para stores SQLite |
| `internal/sync/changelog_store.go` | Modified | Persistencia `pending` desacoplada de `AnimeChangedEvent` |
| `internal/sync/changelog_recorder.go` | Modified | Adaptación mínima `AnimeChangedEvent -> ChangelogEntry` |
| `internal/sync/*_test.go` | Modified/New | Stress tests de concurrencia real y guardrails del contrato |
| `app.go` | Modified | Ajuste mínimo de wiring si el store cambia su contrato |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Bloqueos concurrentes en inserción (SQLITE_BUSY) | High | Test de estrés riguroso, uso de WAL + `busy_timeout`, y ajuste de `SetMaxOpenConns(1)` si fuera necesario |
| Acoplamiento con el dominio Anime | Med | Usar interfaces agnósticas (solo metadata de changelog) sin depender de `anime.Anime` |
| Degradación de performance por encolamiento serializado | Low | Aceptar la penalización a cambio de consistencia y ausencia de panics; el volumen real es bajo |

## Rollback Plan

Revertir los ajustes sobre la frontera compartida de `database/sql` y el contrato Sync-local del store, volviendo al estado inmediato posterior a SDD-07 donde `ChangelogStore` persistía directamente desde `AnimeChangedEvent`.

## Dependencies

- **SDD-02.5**: Driver pure-Go, WAL y bootstrap base.
- **SDD-07**: Recorder del Event Bus y schema `changelog`.

## Success Criteria

- [ ] Un test automatizado lanza 100 goroutines que ejecutan `InsertChangelog` simultáneamente.
- [ ] El test finaliza exitosamente con 0 errores de tipo `database is locked` o `SQLITE_BUSY`.
- [ ] Existe un contrato reusable en `internal/sync` preparado para futuros stores de Sync sin referenciar al dominio Anime.
