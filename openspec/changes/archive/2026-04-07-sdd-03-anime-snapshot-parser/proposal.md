# Proposal: SDD-03 Anime Snapshot Parser

## Intent

Implementar el catch-up persistente de `animes.dat` al arranque del bridge, de forma asíncrona, evitando la "amnesia" cuando el proceso estuvo apagado, y endurecer el parser legacy frente a BOM UTF-8, líneas corruptas, tombstones y ausencia inicial del archivo.

## Scope

### In Scope
- Validar asíncronamente en startup si `animes.dat` existe antes de intentar parsearlo (no bloqueante, cancelable).
- Si el archivo no existe, entrar en un ciclo de idle polling cada 5 segundos sin paniquear el proceso, en una goroutine separada del lifecycle principal.
- Leer `animes.dat` línea por línea con un reader streaming puro y buffer explícito.
- Descartar obligatoriamente el BOM UTF-8 de la primera línea si aparece.
- Reutilizar `LegacyAnimeRaw` de SDD-02A para parsear registros válidos.
- Tolerar líneas corruptas: loguear warning y continuar.
- Consolidar el estado efectivo final por `_id` en memoria, en vez de comparar líneas append-only en crudo.
- Canonicalizar cada registro con `domain.LegacyAnimeRaw.MarshalJSON()` y generar un hash `sha256`.
- Procesar tombstones `$$deleted: true` removiendo el `_id` del estado efectivo.
- Preservar `activo=false` como registro inactivo, NO como borrado.
- Comparar el hash del estado consolidado contra `anime_snapshots` en SQLite de forma transaccional.
- Emitir eventos retroactivos para nuevos registros, cambios detectados y eliminaciones efectivas (usando `AnimeChangedEvent` con `Payload: nil` para los borrados).
- Reemplazar el baseline persistido en `anime_snapshots` de forma transaccional, haciendo upsert de los presentes y pruning (delete) de los ausentes.

### Out of Scope
- File watcher basado en directorio y debounce de SDD-04.
- Writer append-only y self-echo de SDD-05.
- Repositorios completos / changelog de SDD-06 y SDD-07.
- Endpoints HTTP, WebSocket o reconciliación remota.

## Approach

Separar el cambio en tres componentes: un parser puro en streaming, un adapter para SQLite (`SnapshotStore`), y un `StartupCoordinator` asíncrono. El coordinador se lanzará en una goroutine durante el arranque, esperando de forma resiliente la aparición de `animes.dat`. Una vez que el archivo exista, el parser consolidará el estado iterativo por `_id`, generará los hashes `sha256` sobre el JSON canónico (`MarshalJSON`), y el coordinador cruzará la información con el store SQLite. Si hay deltas (nuevos o hashes diferentes), el coordinador emitirá `AnimeChangedEvent`. Si el registro desapareció del archivo crudo pero existe en SQLite, se emitirá un `AnimeChangedEvent{Payload: nil}` como delete retroactivo. Finalmente, el store realizará un reemplazo transaccional del baseline (upserts + deletes paramétricos por pruning).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/parser.go` | New | Parser streaming puro, canonicalización `sha256` y `MarshalJSON`. |
| `internal/anime/startup_catchup.go` | New | Coordinador de startup asíncrono, con polling cancelable. |
| `internal/anime/**/*_test.go` | New/Modified | Tests Strict TDD para polling, BOM, corrupción, tombstones y hashes. |
| `internal/events/` | Reused | Emisión de `AnimeChangedEvent` retroactivo (incluyendo deletes nil). |
| `internal/sync/anime_snapshot_store.go` | New | Acceso a `anime_snapshots` con REPLACE y DELETE transaccional (pruning). |
| `resources/autoreas-data/animes.dat` | Reference | Fixture real de compatibilidad parser |
| `app.go` o wiring equivalente | Modified | Arranque del catch-up en goroutine separada, vinculado al contexto general. |
| `openspec/changes/sdd-03-anime-snapshot-parser/` | Modified | Artefactos SDD actualizados con las decisiones asíncronas, cancelables y de pruning. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Usar lectura completa del archivo y romper memoria/robustez | Med | Forzar diseño streaming línea a línea puro en un `io.Reader`. |
| Confiar en hash por línea y detectar cambios falsos | High | Consolidar estado final por `_id` antes de comparar y usar `MarshalJSON` canónico. |
| Tratar `activo=false` como tombstone | Med | Cubrir explícitamente ambos casos con tests dedicados. |
| Una línea corrupta derriba todo el arranque | High | Warning + continue, nunca panic. |
| Bloquear el arranque de Wails con el polling | High | Requerir explícitamente una goroutine y contexto cancelable en el coordinador. |

## Rollback Plan

Revertir el componente de startup catch-up, el parser streaming y la persistencia de snapshots si el cambio introduce falsos positivos, bloqueos en el arranque asíncrono o inconsistencias con el `animes.dat` real.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-design-doc.md`
- `openspec/changes/archive/2026-04-06-sdd-02a-anime-legacy-raw-model/`
- `openspec/changes/archive/2026-04-06-sdd-02-5-sqlite-bootstrap/`
- `resources/autoreas-data/animes.dat`

## Success Criteria

- [ ] El bridge arranca sin `animes.dat` de forma asíncrona, quedando vivo y esperando en background cada 5 segundos (cancelable).
- [ ] El parser tolera BOM UTF-8 y líneas corruptas sin perder el resto del archivo sano.
- [ ] El estado efectivo se consolida por `_id`, canonicalizando vía `MarshalJSON` y `sha256`.
- [ ] `$$deleted: true` elimina el registro efectivo; `activo=false` lo conserva como inactivo.
- [ ] Los diffs consolidados contra `anime_snapshots` disparan eventos retroactivos correctos (nuevos, actualizados o deletes nil).
- [ ] El baseline se reemplaza transaccionalmente en SQLite, prunando registros que ya no existen.