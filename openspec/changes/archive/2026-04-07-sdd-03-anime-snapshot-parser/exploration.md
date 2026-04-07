## Exploration: sdd-03-anime-snapshot-parser

### Current State
`internal/anime` solo contiene el raw/domain model de SDD-02A (`LegacyAnimeRaw`, `Anime`, `ToAnime`) con muy buena compatibilidad legacy y tests sobre fixture real, pero no existe parser streaming, catch-up de arranque, tombstone handling ni diff de snapshots. `internal/sync` solo expone el bootstrap SQLite de SDD-02.5 con `anime_snapshots(anime_id, snapshot_json, snapshot_hash)` y PRAGMAs WAL/busy_timeout; no hay repositorio de snapshots. `app.go` solo bootstrappea SQLite y guarda `startupErr`; no crea EventBus ni servicio Anime. `internal/events` sí tiene un bus en memoria funcional y testeado, con `AnimeChangedEvent`, pero sin wiring productivo ni semántica explícita de delete.

### Affected Areas
- `internal/anime/domain/anime_raw.go` — base correcta para parsear cada línea válida y canonicalizar raw JSON sin perder campos legacy.
- `internal/anime/` — falta crear la capa real de parser/catch-up; hoy no existe fuera de `domain/`.
- `internal/sync/sqlite_bootstrap.go` — deja lista la tabla, pero falta API para listar/upsert/delete snapshots.
- `app.go` — hoy solo bootstrap SQLite; deberá decidirse cómo disparar catch-up sin bloquear startup indefinidamente.
- `internal/events/{bus.go,event.go}` — contrato disponible para publicar deltas retroactivos, pero delete/create/update sigue subespecificado.

### Approaches
1. **Catch-up coordinador + parser puro + snapshot store chico** — crear un coordinador en `internal/anime`, un parser puro streaming y un store mínimo para `anime_snapshots`.
   - Pros: separa boundary legacy, diff y persistencia; testea bien con Strict TDD.
   - Cons: requiere decidir interfaces nuevas (ticker/logger/store/publisher).
   - Effort: Medium

2. **Implementar todo directo en `app.go`/`internal/sync`** — resolver polling, parseo y snapshots desde wiring/infra actual.
   - Pros: menos archivos nuevos al inicio.
   - Cons: viola arquitectura, mezcla concerns y hace frágil SDD-04/05/07.
   - Effort: Medium-High

### Recommendation
Ir con coordinador + parser puro + store chico. Reusar `LegacyAnimeRaw.MarshalJSON()` o un DTO raw canónico para el hash/payload, NO el `Anime` reducido, porque el dominio actual no preserva todos los campos necesarios para snapshots ni para evitar diffs falsos. Además, el catch-up debe correrse como worker cancelable/no bloqueante del lifecycle, no como espera infinita inline en `App.startup`.

### Risks
- Si solo se hace upsert del baseline y no se borran filas ausentes, los deletes se reemitirán en cada arranque.
- La semántica de evento para deletes está abierta: `AnimeChangedEvent` no distingue create/update/delete.
- Meter idle polling infinito dentro de `App.startup` puede trabar el lifecycle de Wails.
- Falta seam de logger/ticker/store para tests deterministas de Strict TDD.

### Ready for Proposal
Yes — pero antes de `sdd-apply` conviene ajustar artifacts para resolver delete semantics, baseline pruning y lifecycle no bloqueante.
