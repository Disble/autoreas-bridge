# Proposal: SDD-09 REST API, Middlewares y Autenticación

## Intent

Introducir la primera superficie HTTP real del bridge para habilitar pairing y proteger los endpoints expuestos con autenticación por Bearer token, respetando la asimetría del sistema: la Tablet puede actualizar animes existentes, pero NO puede crear ni borrar animes.

## Scope

### In Scope
- Levantar un servidor HTTP embebido en el lifecycle actual de la app.
- Definir un router mínimo para `POST /api/devices/pair`, `/api/animes` y `/api/animes/:id`.
- Implementar middleware Bearer token para endpoints protegidos.
- Persistir el estado mínimo de dispositivos/tokens en SQLite del bridge.
- Bloquear estrictamente `POST /api/animes` y `DELETE /api/animes/:id` con `405 Method Not Allowed`.
- Cubrir con tests HTTP el criterio de éxito de `401` sin token y `405` para `POST /api/animes`.

### Out of Scope
- Implementación completa de `PATCH /api/animes/:id` (queda para SDD-10).
- Endpoint `POST /api/sync/reconcile`.
- WebSocket real y mDNS (`SDD-11`).
- UI Wails para generar/revocar tokens.
- Read model completo de animes para list/detail.

## Approach

Agregar un adapter HTTP mínimo basado en `net/http`, con reglas de método explícitas por ruta para resolver correctamente la frontera `405 vs 401`. El dominio `internal/device` proveerá pairing y validación de tokens sobre la misma SQLite del bridge, mientras `app.go` seguirá siendo el punto único de wiring y shutdown coordinado.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `internal/api/` | New | HTTP server, router, middleware y handlers mínimos |
| `internal/device/` | New | Servicio y store SQLite de pairing/auth |
| `internal/sync/sqlite_bootstrap.go` | Modified | Schema mínimo para dispositivos/tokens |
| `app.go` | Modified | Wiring lifecycle del servidor HTTP |
| `openspec/changes/sdd-09-rest-api-middlewares-auth/` | New | Artefactos del change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Resolver mal `405` vs `401` | High | Diseñar handlers por ruta/método antes del middleware auth y testear ambas ramas |
| Sobrealcanzar SDD-09 con lógica de negocio de PATCH | High | Mantener `PATCH /api/animes/:id` como placeholder autenticado y diferir mutación real a SDD-10 |
| Schema improvisado de dispositivos/tokens | Medium | Mantener tablas mínimas y explícitas, documentando extensiones futuras |
| Mezclar HTTP con Wails o dominios existentes | Medium | Encapsular todo en adapter `internal/api` y dominio `internal/device` |

## Rollback Plan

Revertir el wiring HTTP en `app.go`, eliminar el adapter `internal/api`, el dominio `internal/device` y las tablas SQLite agregadas. El resto del bridge seguiría funcionando sin red, preservando parser, watcher, writer, snapshots y changelog.

## Dependencies

- `docs/sdd-tree.md`
- `docs/architecture.md`
- `docs/autoreas-bridge-rfc.md`
- `internal/events/`
- `internal/sync/sqlite_bootstrap.go`
- `app.go`

## Success Criteria

- [ ] Una request HTTP protegida sin token devuelve `401 Unauthorized`.
- [ ] `POST /api/animes` devuelve `405 Method Not Allowed`.
- [ ] Existe `POST /api/devices/pair` con persistencia mínima de dispositivo/token.
- [ ] El servidor HTTP arranca y se apaga con el lifecycle existente sin romper los componentes ya implementados.
