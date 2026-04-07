## Exploration: sdd-05-append-only-safe-writer

### Current State
El repo ya tiene lectura robusta del dominio Anime (`SDD-03`) y watcher runtime resiliente (`SDD-04`), ambos basados en parseo efectivo por `_id`. Pero todavía NO existe ningún writer productivo: no hay subscriber a `AnimeUpdateRequestedEvent`, no hay cola secuencial para evitar concurrencia de `os.OpenFile`, no hay append-only hacia `animes.dat`, y tampoco hay deduplicación/self-echo entre writer y watcher.

### Affected Areas
- `internal/anime/` — nuevo writer runtime, hashing de self-echo, cola worker y tests de estrés/concurrency.
- `internal/events/` — ya existe `AnimeUpdateRequestedEvent`; el writer deberá suscribirse al bus actual sin cambiar contratos salvo que haga falta algún helper de wiring.
- `internal/anime/watcher.go` — probablemente necesite integración con un registro de hashes enviados para ignorar self-echo del writer.
- `app.go` — wiring del writer junto al watcher y el catch-up actuales.

### Approaches
1. **Writer dedicado en `internal/anime` con worker channel, append-only y self-echo registry compartido con watcher**.
   - Pros: respeta la arquitectura, encapsula la presión de filesystem y prepara bien el camino para `SDD-07`/`SDD-08`.
   - Cons: requiere coordinar dos piezas runtime del mismo dominio (watcher + writer) sin acoplarlas de forma sucia.
   - Effort: High.

2. **Manejar escrituras directas en el handler del evento o desde `app.go` sin worker dedicado**.
   - Pros: menos archivos al principio.
   - Cons: rompe la premisa central del SDD, expone al bug de `The process cannot access the file` y mezcla infraestructura con wiring.
   - Effort: Medium.

### Recommendation
Ir con un writer dedicado y serializado dentro de `internal/anime`, alimentado por suscripción al Event Bus. El writer debe ser el único actor que abre `animes.dat` para escribir, registrar hashes MD5 de payloads enviados y emitir `AnimeChangedEvent` de confirmación inmediatamente después de cada append exitoso. El watcher de `SDD-04` debe integrar ese registro para ignorar self-echo sin dejar de detectar cambios externos reales.

### Risks
- Si el writer y watcher comparten estado de self-echo de forma improvisada, aparece carrera o fuga de memoria en el mapa de hashes.
- Si el writer intenta reusar el parser/watcher de forma directa para confirmar escrituras, se duplica trabajo y se rompen responsabilidades.
- Si las pruebas no fuerzan concurrencia real, podemos “aprobar” algo que en Windows vuelva a fallar por lock del archivo.

### Ready for Proposal
Yes — el objetivo está claro: introducir escritura append-only serializada con deduplicación explícita y publicación confirmada al bus, sin adelantar aún reconciliación ni HTTP.
