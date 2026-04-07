## Exploration: sdd-07-changelog-recorder

### Current State
El repo ya tiene el flujo base completo del dominio Anime: parser/catch-up (`SDD-03`), watcher runtime (`SDD-04`) y writer append-only (`SDD-05`). Además, existe bootstrap SQLite mínimo y `anime_snapshot_store` en `internal/sync`, pero todavía NO hay ninguna tabla `changelog` ni servicio que escuche `AnimeChangedEvent` para persistir cambios pendientes. O sea: los eventos ya circulan, pero Sync todavía no los retiene.

### Affected Areas
- `internal/sync/` — nuevo recorder/repository para `changelog` y pruebas de inserción por evento.
- Bootstrap SQLite (`internal/sync` / `app.go`) — probablemente deba expandirse schema para incluir `changelog`.
- `app.go` — wiring del recorder sobre el Event Bus.
- Tests de integración SQLite real — indispensables para probar inserción efectiva ante eventos reales del bus.

### Approaches
1. **Recorder dedicado en `internal/sync` suscripto al Event Bus + repo SQLite específico**.
   - Pros: respeta bounded context Sync y separa persistencia/event handling del dominio Anime.
   - Cons: obliga a tocar bootstrap SQLite para agregar schema adicional antes de SDD-08.
   - Effort: Medium.

2. **Persistir changelog directo desde `app.go` o desde subscribers ad hoc**.
   - Pros: rápido para “hacer que ande”.
   - Cons: mezcla wiring con lógica de dominio y se vuelve inmanejable cuando llegue reconciliación.
   - Effort: Low-Medium.

### Recommendation
Ir con un recorder dedicado en `internal/sync` que suscriba `AnimeChangedEvent`, transforme cada evento en un registro `pending` y lo inserte en SQLite mediante un repo explícito. El recorder debe poder iniciarse y detenerse con el lifecycle de la app y reusar la conexión WAL ya bootstrappeada en cambios previos.

### Risks
- Si se inserta changelog sin schema/versioning claro, `SDD-08` va a heredar una base inestable.
- Si el recorder depende de detalles internos del dominio Anime, se rompe el desacople que el bus ya nos dio.
- Si se testea solo con mocks, podemos ocultar problemas reales de SQLite y constraints futuras.

### Ready for Proposal
Yes — el cambio es acotado y natural después de `SDD-05`: persistir `AnimeChangedEvent` en `changelog` como base para reconciliación futura.
