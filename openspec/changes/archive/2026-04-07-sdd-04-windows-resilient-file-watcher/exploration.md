## Exploration: sdd-04-windows-resilient-file-watcher

### Current State
El repo ya resolvió `SDD-03`: existe parser streaming resiliente, baseline SQLite y catch-up async/cancelable en startup. Sin embargo, todavía NO existe ningún file watcher productivo: no hay `fsnotify`, no hay observación del directorio `data/`, no hay debouncer ni retry loop. `internal/anime/startup_catchup.go` solo atiende el bootstrap retroactivo al arranque; una vez terminado, el bridge queda ciego a cambios posteriores de `animes.dat`.

### Affected Areas
- `internal/anime/` — falta una nueva capa de watcher runtime que observe el directorio padre, filtre `animes.dat`, reprocesse el snapshot efectivo y publique `AnimeChangedEvent`.
- `app.go` — deberá iniciar y detener el watcher sin romper el lifecycle ya ganado para catch-up de startup.
- `internal/events/` — se reutiliza el bus actual; no necesita cambios de contrato salvo que la implementación requiera helpers de wiring.
- Tests nuevos de integración con filesystem temporal — indispensables para demostrar rename/remove/create sin detachment.

### Approaches
1. **Watcher encapsulado en `internal/anime` con adapter `fsnotify` + debouncer + retry loop**.
   - Pros: mantiene boundary filesystem aislado, se testea con seams y respeta arquitectura hexagonal.
   - Cons: requiere definir varias abstracciones chicas (watcher backend, reloj/timer, file opener, logger).
   - Effort: Medium-High.

2. **Usar polling periódico sobre el archivo desde `app.go`**.
   - Pros: más rápido de escribir.
   - Cons: contradice el árbol/arquitectura, desperdicia trabajo ya hecho en catch-up y no prueba la resiliencia a atomic replace de Windows.
   - Effort: Medium.

### Recommendation
Ir con un watcher dedicado en `internal/anime` que observe el directorio padre de `animes.dat`, filtre por basename, y ante eventos relevantes reprograme un parseo debounced. El flujo debe reusar el parser/snapshot diff ya existentes para evitar lógica duplicada y debe tolerar reemplazos atómicos del archivo sin quedar detached.

### Risks
- Observar el archivo en vez del directorio introduciría el bug clásico de detachment silencioso en Windows tras rename/create.
- Si el debouncer no se diseña bien, varios eventos del mismo guardado pueden disparar parseos redundantes o carreras con el writer futuro de SDD-05.
- Si el watcher publica directo líneas o hashes parciales, rompería la verdad arquitectónica ya establecida en SDD-03: el estado efectivo es por `_id`, no por línea append-only.

### Ready for Proposal
Yes — la frontera del cambio está clara: runtime watching post-startup sobre el directorio padre, reusando parser/diff efectivos sin adelantar el writer de SDD-05.
