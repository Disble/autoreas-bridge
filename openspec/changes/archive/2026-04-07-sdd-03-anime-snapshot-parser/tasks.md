# Tasks: SDD-03 Anime Snapshot Parser

## Phase 1: Foundation

- [x] 1.1 Crear la estructura del cambio y el `verify-report.md` base para Strict TDD.
- [x] 1.2 Definir contratos (interfaces) para `SnapshotParser`, `SnapshotStore` y el `StartupCoordinator` async.
- [x] 1.3 Preparar dobles de prueba (fakes) para reloj/ticker, context, logger y publicación de eventos.

## Phase 2: Strict TDD — Parser streaming y canonicalización

- [x] 2.1 RED: escribir test para descartar BOM UTF-8 en la primera línea usando un parser puro `io.Reader`.
- [x] 2.2 GREEN: implementar sanitización de la primera línea en `internal/anime/parser.go`.
- [x] 2.3 REFACTOR: extraer lectura sanitizada o wrapper del reader.
- [x] 2.4 RED: escribir test demostrando que un error de parseo (JSON corrupto) emite un warning y no aborta.
- [x] 2.5 GREEN: atrapar error de JSON por línea, registrar warning y continuar el ciclo de lectura.
- [x] 2.6 RED: escribir test probando buffering con líneas largas y canonicalización correcta vía `domain.LegacyAnimeRaw.MarshalJSON()` + `sha256`.
- [x] 2.7 GREEN: usar `bufio.Scanner` modificado o `bufio.Reader` e implementar canonicalización y hash estricto por `_id`.
- [x] 2.8 RED: test de tombstones (`$$deleted: true`) eliminando del mapa; y flag `activo=false` dejándolo presente.
- [x] 2.9 GREEN: aplicar mutación del mapa de estado final al detectar `$$deleted` en líneas finales.

## Phase 3: Strict TDD — Persistencia transaccional y pruning

- [x] 3.1 RED: escribir test para el adapter `SnapshotStore` probando `ReplaceBaseline` con altas, actualizaciones y bajas.
- [x] 3.2 GREEN: implementar transacción SQLite con upsert de presentes y DELETE paramétrico (pruning) de ausentes en `internal/sync/anime_snapshot_store.go`.
- [x] 3.3 REFACTOR: limpiar query strings para evitar inyección, usando placeholders dinámicos o arrays.

## Phase 4: Strict TDD — Coordinador de catch-up async cancelable

- [x] 4.1 RED: escribir test del `StartupCoordinator` demostrando que arranca en background sin bloquear, con idle polling si falta `animes.dat`.
- [x] 4.2 GREEN: aislar el loop principal `select { case <-ctx.Done(): ... case <-ticker: ... }`.
- [x] 4.3 REFACTOR: extraer inyección de dependencias para aislar filesystem, ticker, parser y store.
- [x] 4.4 RED: test que verifique el path feliz cuando el archivo aparece: parsea, recupera de store, diff de snapshots, publica y hace reemplazo.
- [x] 4.5 GREEN: implementar la lógica de diffs cruzando memoria y base local, y disparando el `ReplaceBaseline`.
- [x] 4.6 RED: test verificando la publicación retroactiva de deletes con `AnimeChangedEvent{Payload: nil}` ante ausentes.
- [x] 4.7 GREEN: emitir evento vacío en caso de records viejos que ya no están en `animes.dat`.
- [x] 4.8 REFACTOR: unificar el envío de deltas en un publicador abstracto en el coordinador.

## Phase 5: Integración y Fixture real

- [x] 5.1 RED: agregar test de integración del `StartupCoordinator` usando una base de datos SQLite efímera real.
- [x] 5.2 GREEN: wiring de dependencias reales (`events`, `sqlite`, filepath temp) para el test.
- [x] 5.3 RED: usar `resources/autoreas-data/animes.dat` temporal y verificar que el parser procesa sin warning fatal el archivo íntegro.
- [x] 5.4 GREEN/REFACTOR: ajustar buffers o warnings según las líneas fallidas reales si aparecieran.
- [x] 5.5 Modificar `app.go` o equivalente para inyectar `StartupCoordinator`, invocarlo en goroutine (async) asociando su cancelación al ciclo de vida de Wails.
- [x] 5.6 Ejecutar `go test ./...` y documentar evidencia Strict TDD en `apply-progress.md`.
- [x] 5.7 Ejecutar `golangci-lint run` y `go vet ./...`.
- [x] 5.8 Actualizar `verify-report.md` con matriz de cumplimiento, cobertura y veredicto.
