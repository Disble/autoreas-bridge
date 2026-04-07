# Proposal: SDD-05 Append-Only Safe Writer

## Intent

Agregar la capacidad de escribir cambios validados a `animes.dat` de forma append-only y segura para Windows, evitando concurrencia de apertura del archivo y filtrando el self-echo que el watcher runtime leería inmediatamente después.

## Scope

### In Scope
- Suscribirse a `AnimeUpdateRequestedEvent` desde el dominio Anime.
- Implementar una cola worker de un solo consumidor para serializar escrituras a `animes.dat`.
- Escribir líneas append-only JSON sin sobrescribir el archivo completo.
- Registrar hashes MD5 de payloads emitidos por el writer para que el watcher ignore self-echo.
- Emitir `AnimeChangedEvent` al Event Bus inmediatamente después de cada escritura exitosa.
- Integrar writer + watcher + app lifecycle.
- Cubrir concurrencia (50 eventos), self-echo filtering y publicación confirmada con tests relevantes.

### Out of Scope
- API HTTP/REST, reconciliación CRDT o WebSocket.
- Reescribir el watcher de `SDD-04` salvo lo necesario para integrar self-echo filtering.
- Validación de negocio profunda del payload; este SDD asume que el evento ya llegó validado.

## Approach

Crear un writer dedicado dentro de `internal/anime` que reciba eventos por canal interno, serialice `os.OpenFile(..., O_APPEND|O_CREATE|O_WRONLY)`, escriba una línea por evento y cierre de forma determinista. Tras escribir, el writer registra el hash del payload en un registry compartido con el watcher y publica un `AnimeChangedEvent` de confirmación al bus. El watcher, al procesar cambios de filesystem, consultará ese registry para ignorar payloads recién inyectados por el propio bridge.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/anime/` | New/Modified | Writer, registry de self-echo, tests de estrés y posible integración con watcher |
| `internal/events/` | Reused | `AnimeUpdateRequestedEvent` y `AnimeChangedEvent` |
| `app.go` | Modified | Wiring del writer runtime |
| `app_test.go` | Modified | Startup/shutdown del writer junto a watcher/catch-up |
| `openspec/changes/sdd-05-append-only-safe-writer/` | New | Artefactos del cambio |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Locks concurrentes del archivo en Windows | High | Worker único + tests de estrés con aperturas controladas |
| Self-echo duplicando eventos | High | Registry de hashes compartido con watcher y tests cruzados |
| Mezcla de responsabilidades entre writer y watcher | Med | Mantener writer como productor de confirmaciones y watcher como detector de cambios externos |
| Fuga de hashes en memoria | Med | Diseñar política de consumo/expiración al ignorar self-echo |

## Rollback Plan

Revertir el writer runtime y su wiring, manteniendo intactos parser, startup catch-up y watcher de `SDD-04`. El bridge volvería a modo read-only.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `openspec/specs/windows-resilient-file-watcher/spec.md`
- `internal/anime/watcher.go`
- `internal/events/event.go`

## Success Criteria

- [ ] Un burst de 50 `AnimeUpdateRequestedEvent` se serializa sin aperturas concurrentes del archivo.
- [ ] Cada append exitoso publica un `AnimeChangedEvent` de confirmación.
- [ ] El watcher filtra el self-echo del writer usando hashes compartidos.
- [ ] El archivo sigue append-only; no se reescribe completo.
- [ ] App startup/shutdown manejan writer y watcher sin regresiones.
