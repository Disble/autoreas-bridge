# Design: SDD-09 REST API, Middlewares y Autenticación

## Technical Approach

Implementar un servidor HTTP embebido con `net/http` y `http.ServeMux`, montado desde `app.go` junto al resto del runtime. La API se dividirá en un adapter `internal/api` y un bounded context mínimo `internal/device` para pairing/auth sobre SQLite. La clave técnica de este change es separar el control de método del control de autenticación para que `/api/animes` responda `405` cuando corresponda, sin que el middleware tape la asimetría con un `401` incorrecto.

## Architecture Decisions

### Decision: `net/http` estándar en vez de Echo

**Choice**: usar `net/http` + `http.ServeMux`.
**Alternatives considered**: `echo`, router de terceros.
**Rationale**: el alcance es chico, las dependencias actuales no usan Echo realmente y el stdlib reduce superficie accidental en un change centrado en contratos HTTP básicos.

### Decision: Guardas de método antes de auth para rutas prohibidas

**Choice**: handlers de `/api/animes` y `/api/animes/:id` resuelven primero el método permitido y recién después aplican autenticación en métodos válidos.
**Alternatives considered**: middleware auth global sobre todo `/api`.
**Rationale**: evita falsos `401` sobre rutas/métodos que el contrato exige rechazar con `405` por asimetría.

### Decision: dominio `internal/device` mínimo y persistente

**Choice**: crear `internal/device` con servicio y store SQLite mínimos para pairing y validación de bearer tokens.
**Alternatives considered**: guardar tokens en memoria; mezclar auth en `internal/api`.
**Rationale**: la arquitectura del repo ya define `internal/device` como bounded context y la persistencia debe sobrevivir reinicios.

### Decision: lifecycle HTTP orquestado desde `app.go`

**Choice**: iniciar/parar el servidor desde `app.go` junto con watcher, writer y recorder.
**Alternatives considered**: arrancar desde `main.go`; goroutine suelta sin control.
**Rationale**: `app.go` ya es el composition root real del bridge y concentra dependencias compartidas como SQLite y EventBus.

## Data Flow

```text
tablet/client
   -> HTTP request
   -> api router
      -> method guard (405 si corresponde)
      -> bearer auth middleware (401 si falta/invalid)
      -> device service / anime placeholder handler
      -> HTTP response
```

## Sequence Diagram

### Pairing

```text
Client -> POST /api/devices/pair: {pairing_token, device_name}
API -> DeviceService: PairDevice(...)
DeviceService -> DeviceStore: consume pairing token + persist device/auth token
DeviceStore -> SQLite: INSERT/UPDATE
API -> Client: 201 Created + bearer token
```

### Protected anime route without token

```text
Client -> PATCH /api/animes/:id
API -> Bearer middleware: validate Authorization header
Bearer middleware -> Client: 401 Unauthorized
```

### Forbidden anime method

```text
Client -> POST /api/animes
API route handler -> Client: 405 Method Not Allowed
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `internal/api/server.go` | Create | Server bootstrap/shutdown y constructor de router |
| `internal/api/router.go` | Create | Rutas `/api/devices/pair`, `/api/animes`, `/api/animes/:id` |
| `internal/api/middleware_auth.go` | Create | Parseo y validación Bearer |
| `internal/api/handlers_devices.go` | Create | Handler de pairing |
| `internal/api/handlers_animes.go` | Create | Guardas de método y placeholder autenticado para PATCH |
| `internal/api/*_test.go` | Create | Tests HTTP con `httptest` |
| `internal/device/service.go` | Create | Pairing + validación de auth token |
| `internal/device/sqlite_store.go` | Create | Persistencia SQLite de dispositivos/tokens |
| `internal/device/*_test.go` | Create | Tests del dominio device/store |
| `internal/sync/sqlite_bootstrap.go` | Modify | Agregar tablas mínimas `pairing_tokens` y `devices` |
| `app.go` | Modify | Iniciar/parar server HTTP con dependencias |

## Interfaces / Contracts

```go
package device

type PairDeviceRequest struct {
	PairingToken string
	DeviceName   string
}

type PairedDevice struct {
	DeviceID  string
	Name      string
	AuthToken string
}

type Service interface {
	PairDevice(ctx context.Context, req PairDeviceRequest) (PairedDevice, error)
	AuthenticateToken(ctx context.Context, token string) (PairedDevice, error)
}
```

```go
package api

type TokenAuthenticator interface {
	AuthenticateToken(ctx context.Context, token string) (device.PairedDevice, error)
}
```

Behavior contract:
- `POST /api/devices/pair` acepta JSON estricto con token de pairing y nombre de dispositivo.
- `/api/animes` rechaza `POST` con `405` sin necesitar auth previa.
- `/api/animes/:id` rechaza `DELETE` con `405`.
- `PATCH /api/animes/:id` exige Bearer válido pero su mutación real queda deferida a SDD-10.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Parseo Bearer y errores auth | tests de middleware con fakes |
| Unit | Pairing/auth service | tests de service con store fake |
| Integration | SQLite store de dispositivos/tokens | DB real temp + bootstrap existente |
| Integration | HTTP 401/405 | `httptest` sobre router real |
| Regression | Wiring de `app.go` | extender tests de startup/shutdown sin build |

## Migration / Rollout

Agregar tablas nuevas al bootstrap SQLite del bridge. No hay migraciones destructivas; el cambio es aditivo y compatible con bases existentes vacías o ya inicializadas.

## Open Questions

- [ ] Si el token de pairing inicial se genera automáticamente al boot o mediante binding/UI posterior.
- [ ] Si conviene diferenciar token de pairing one-shot y bearer permanente desde ya o en SDD-10/11.
