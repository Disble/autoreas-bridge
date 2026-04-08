# Design: SDD-11 WebSocket Hub y Re-Sync Obligatorio

## Technical Approach

Introducir un bounded adapter `internal/realtime` encargado del hub WebSocket y del fan-out de eventos, manteniendo `internal/api` como punto de entrada HTTP/WS autenticado. La conexión principal para mobile se resuelve por **IP local + QR/Token**, no por multicast. En cada conexión WS el cliente recibe un mensaje de control `sync_required` para asumir gap y disparar `POST /api/sync/reconcile`.

## Architecture Decisions

### Decision: IP/QR como canal principal de conexión

**Choice**: la dirección efectiva del bridge se comunica por IP/puerto + QR/Token.
**Alternatives considered**: mantener mDNS como mecanismo principal.
**Rationale**: la experiencia real en mobile mostró mayor confiabilidad con conexión explícita y menos dependencia de multicast/firewall/NSD.

### Decision: Hub desacoplado del Event Bus síncrono

**Choice**: suscribir el hub a `AnimeChangedEvent`, pero usar cola interna/fan-out para no bloquear publishers.
**Alternatives considered**: escribir directo a sockets desde el subscriber.
**Rationale**: `MemoryBus.Publish` hoy invoca handlers inline; escribir a sockets lento ahí sería una mala decisión arquitectónica.

### Decision: gap asumido, sin replay fino en este slice

**Choice**: cada conexión/reconexión WS manda `sync_required`; el cliente usa REST reconcile.
**Alternatives considered**: replay por cursor/ack per-device.
**Rationale**: el modelo actual no tiene cursor ni ack duradero, así que meter replay fino ahora sería sobrealcance.

## Data Flow

```text
AnimeChangedEvent
  -> Event Bus
  -> realtime hub subscriber
  -> fan-out non-blocking
  -> websocket clients

WS connect/reconnect
  -> bearer auth
  -> register client in hub
  -> send {type:"sync_required", reason:"connection_gap_assumed"}
  -> client triggers POST /api/sync/reconcile
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/api/router.go` | Modify | Registrar `WS /ws` autenticado |
| `internal/api/server.go` | Modify | Extender config realtime/address exposure |
| `internal/api/handlers/websocket_handler.go` | Create | Handshake WS + auth + registro en hub |
| `internal/realtime/hub.go` | Create | Registro de clientes y broadcast desacoplado |
| `internal/realtime/message.go` | Create | Contratos JSON para control/eventos realtime |
| `app.go` | Modify | Wiring lifecycle hub + suscripción al bus |

## Interfaces / Contracts

```go
type Hub interface {
    Register(ctx context.Context, client Client) error
    Unregister(clientID string)
    BroadcastAnimeChanged(ctx context.Context, event events.AnimeChangedEvent)
}

type ControlMessage struct {
    Type   string `json:"type"`
    Reason string `json:"reason,omitempty"`
}
```

Handshake contract:
- `WS /ws` requiere `Authorization: Bearer <token>` o equivalente definido por el adapter.
- Al conectar, el servidor envía inmediatamente `{"type":"sync_required","reason":"connection_gap_assumed"}`.
- Los eventos de anime usan payload completo derivado de `AnimeChangedEvent`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Registro/unregister/broadcast del hub | tests de hub con clientes fake |
| Integration | Handshake WS autenticado/no autenticado | `httptest` + websocket client |
| Integration | Mensaje inicial `sync_required` | test de conexión/reconexión |
| Integration | Broadcast de `AnimeChangedEvent` | publicar en bus y verificar frame WS |

## Migration / Rollout

No requiere migración de SQLite. Reutiliza dispositivos/auth ya existentes y el endpoint `POST /api/sync/reconcile` introducido en SDD-10.

## Open Questions

- [ ] Si el token WS entrará por header estándar o query param para simplificar el cliente mobile.
- [ ] Cómo se expondrá la IP/puerto efectivo al frontend/Wails en el slice siguiente.
