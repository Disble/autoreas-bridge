# Design: SDD-04 Windows-Resilient File Watcher

## Technical Approach

Implementar un `RuntimeWatcher` dentro de `internal/anime` como adapter de filesystem y coordinador de parseo incremental. El watcher no emitirá cambios por línea ni leerá diffs del OS directamente como verdad; en su lugar, cada flush del debouncer volverá a leer `animes.dat`, consolidará el estado efectivo con el parser existente y comparará contra el baseline/snapshot en memoria o persistido para publicar deltas correctos por `_id`.

## Architecture Decisions

### Decision: Observar el directorio padre, nunca el archivo directo

**Choice**: registrar el watcher sobre `filepath.Dir(animeDataPath)` y filtrar por `filepath.Base(animeDataPath) == "animes.dat"`.
**Alternatives considered**: observar `animes.dat` directo; polling del archivo.
**Rationale**: el árbol y la arquitectura ya documentan el riesgo real de detachment en Windows por replace atómico. Mirar el directorio conserva continuidad aunque cambie el inode/file handle.

### Decision: Reusar parser/diff efectivo de SDD-03

**Choice**: cada evento debounced dispara parseo streaming + comparación efectiva por `_id` usando la infraestructura ya creada.
**Alternatives considered**: diff por líneas append-only; publicar eventos crudos del backend fs.
**Rationale**: NeDB es append-only; el contrato correcto ya está resuelto en SDD-03. Duplicar o degradar esa lógica rompería consistencia entre catch-up y runtime.

### Decision: Debouncer explícito antes de parsear

**Choice**: agrupar ráfagas de eventos de filesystem antes de reprocesar el archivo.
**Alternatives considered**: parsear en cada evento; throttle fijo sin reset.
**Rationale**: Windows/NeDB puede emitir bursts (`write`, `rename`, `create`, etc.) para un solo guardado. Parsear cada uno genera ruido, carreras y trabajo redundante.

## Data Flow

```text
OS filesystem event
   -> watcher on parent directory
   -> filter basename == animes.dat
   -> debouncer reset/start
   -> debounced flush
   -> parse animes.dat with existing snapshot parser
   -> diff effective state against last known baseline
   -> publish AnimeChangedEvent deltas
   -> refresh in-memory/runtime baseline
```

## Sequence Diagram

```text
Autoreas Desktop -> Filesystem: replace animes.dat atomically
Filesystem -> RuntimeWatcher: rename/remove/create events on parent dir
RuntimeWatcher -> Debouncer: reset timer
Debouncer -> RuntimeWatcher: flush
RuntimeWatcher -> SnapshotParser: parse animes.dat
SnapshotParser -> RuntimeWatcher: effective snapshots
RuntimeWatcher -> Diff logic: compare against previous baseline
Diff logic -> EventBus: AnimeChangedEvent (create/update/delete)
RuntimeWatcher -> Baseline store/memory: update current runtime baseline
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/anime/watcher.go` | Create | Servicio watcher, backend abstractions, debouncer integration |
| `internal/anime/watcher_test.go` | Create | Unit tests del debouncer/filtro/retry |
| `internal/anime/watcher_integration_test.go` | Create | Rename/remove/create sobre temp dir real |
| `app.go` | Modify | Wiring del watcher junto al catch-up existente |
| `app_test.go` | Modify | Startup/shutdown del watcher |
| `go.mod` / `go.sum` | Maybe Modify | Backend `fsnotify` si se usa |

## Interfaces / Contracts

```go
package anime

type RuntimeWatcher interface {
	Start(ctx context.Context)
	Wait()
	Err() error
}

type FSWatcher interface {
	Add(name string) error
	Events() <-chan FileEvent
	Errors() <-chan error
	Close() error
}
```

Notas:
- Los nombres exactos pueden variar, pero el contrato debe separar backend fs, debounce y publicación.
- El watcher runtime no reemplaza `StartupCoordinator`; ambos conviven.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | filtro por basename + debounce + retry logic | fakes del backend fs + timers controlados |
| Integration | rename/remove/create de `animes.dat` en temp dir | filesystem real + watcher backend real |
| Regression | coexistencia con startup/shutdown actual | extender `app_test.go` |
| Behavioral | publicación correcta de deltas create/update/delete | reusar parser/diff y assert sobre bus/sink de eventos |

## Migration / Rollout

No migration required.

## Open Questions

- [ ] Definir si el watcher runtime mantiene baseline en memoria, reutiliza SQLite o combina ambas fuentes para evitar re-emisiones duplicadas.
- [ ] Determinar si el retry loop debe recrear solo el backend fs o el servicio completo ante errores.
