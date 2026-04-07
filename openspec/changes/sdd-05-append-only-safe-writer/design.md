# Design: SDD-05 Append-Only Safe Writer

## Technical Approach

Implementar un `UpdateWriter` dentro de `internal/anime` que suscriba `AnimeUpdateRequestedEvent`, encole payloads y los procese con un único worker goroutine. Cada elemento del canal abrirá `animes.dat` en modo append, escribirá exactamente una línea JSON y cerrará el archivo. Después registrará el hash MD5 del payload en un registry compartido y publicará `AnimeChangedEvent` para propagar el cambio sin depender del watcher, que deberá ignorar el self-echo del filesystem.

## Architecture Decisions

### Decision: Single-threaded worker channel para escribir

**Choice**: un solo worker eterno que consume eventos y serializa `os.OpenFile`.
**Alternatives considered**: escribir inline en cada subscriber; pool de workers.
**Rationale**: el problema explícito del SDD es la apertura concurrente en Windows. Un pool reintroduce la misma clase de fallo; escribir inline acopla demasiado la infraestructura.

### Decision: Self-echo por hash compartido, no por supresión temporal ciega

**Choice**: registrar MD5 del payload enviado para que el watcher ignore solo esos cambios exactos.
**Alternatives considered**: pausar el watcher; ignorar todas las notificaciones durante una ventana temporal.
**Rationale**: una ventana ciega podría esconder cambios externos reales. Hash exacto preserva precisión semántica.

### Decision: El writer publica confirmación al bus tras escritura exitosa

**Choice**: emitir `AnimeChangedEvent` directamente después del append exitoso.
**Alternatives considered**: dejar que solo el watcher publique; no publicar nada.
**Rationale**: el watcher va a ignorar self-echo, así que si el writer no confirma, Sync y WS se enterarían tarde o nunca.

## Data Flow

```text
AnimeUpdateRequestedEvent
   -> writer subscriber
   -> single worker channel
   -> open animes.dat in append mode
   -> write JSON line + newline
   -> close file
   -> register payload hash in self-echo registry
   -> publish AnimeChangedEvent confirmation
   -> watcher sees filesystem event
   -> watcher computes payload hash and ignores if it matches registry
```

## Sequence Diagram

```text
Bus -> UpdateWriter: AnimeUpdateRequestedEvent
UpdateWriter -> queue: enqueue payload
Worker -> FileSystem: open animes.dat (append)
Worker -> FileSystem: write line + close
Worker -> SelfEchoRegistry: remember payload hash
Worker -> EventBus: AnimeChangedEvent
Filesystem -> RuntimeWatcher: write event on parent directory
RuntimeWatcher -> SelfEchoRegistry: consume/compare hash
SelfEchoRegistry -> RuntimeWatcher: self-echo matched
RuntimeWatcher -> (drop): no duplicate AnimeChangedEvent
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/anime/writer.go` | Create | Writer runtime, worker queue y subscription al bus |
| `internal/anime/writer_test.go` | Create | Tests unitarios/estrés del writer |
| `internal/anime/writer_integration_test.go` | Create | Append real a temp dir y self-echo con watcher |
| `internal/anime/watcher.go` | Modify | Integración con registry de self-echo |
| `app.go` | Modify | Wiring del writer junto al watcher |
| `app_test.go` | Modify | Startup/shutdown writer lifecycle |

## Interfaces / Contracts

```go
package anime

type UpdateWriter interface {
	StartAsync(ctx context.Context)
	Wait()
	Err() error
}

type SelfEchoRegistry interface {
	Remember(payload []byte)
	ConsumeIfPresent(payload []byte) bool
}
```

Notas:
- Los nombres concretos pueden variar, pero el writer y el registry deben quedar desacoplados del watcher backend.
- El writer no valida negocio: persiste lo que ya llegó validado como evento de dominio.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | 50 eventos se serializan sin escrituras concurrentes | fake opener/writer con contador de concurrencia |
| Unit | confirmación `AnimeChangedEvent` tras append exitoso | publisher recording |
| Unit | registry consume self-echo exacto y no oculta payloads ajenos | tests de hashes |
| Integration | append real a temp dir + watcher ignora self-echo | filesystem real + watcher runtime |
| Regression | app arranca y apaga writer junto a watcher/catch-up | extender `app_test.go` |

## Migration / Rollout

No migration required.

## Open Questions

- [ ] Definir si el registry consume hashes una sola vez o mantiene una ventana acotada para bursts de eventos duplicados del OS.
- [ ] Evaluar si el writer debe aceptar batch interno por performance o mantener estrictamente un open/write/close por evento para claridad inicial.
