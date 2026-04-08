# Verify Report: SDD-09 REST API, Middlewares y Autenticación

**Date:** 2026-04-08

### Verdict

PASS

## Summary

SDD-09 quedó implementado con un servidor HTTP embebido, un dominio mínimo `internal/device` para pairing/auth persistente en SQLite, enforcement explícito de `405` para métodos prohibidos en rutas de anime y autenticación Bearer para `PATCH /api/animes/:id`. La mutación real de PATCH sigue diferida a SDD-10 tal como permite la spec.

## Scenario Coverage

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| Embedded HTTP server lifecycle | HTTP server starts with the app | `app_test.go > TestAppStartupStartsHTTPServerWhenConfigured` | PASS |
| Embedded HTTP server lifecycle | HTTP server stops on shutdown | `app_test.go > TestAppShutdownStopsHTTPServer` | PASS |
| Device pairing endpoint exists | Pair device with valid payload | `internal/api/router_test.go > TestPairDeviceReturnsCreatedAndBearerToken`; `internal/device/sqlite_store_test.go > TestSQLiteStoreConsumesPairingTokenAndPersistsDevice` | PASS |
| Device pairing endpoint exists | Reject malformed pairing payload | `internal/api/router_test.go > TestPairDeviceRejectsMalformedPayload` | PASS |
| Bearer token middleware protects anime mutations | Missing token returns 401 | `internal/api/router_test.go > TestPatchAnimeWithoutTokenReturnsUnauthorized` | PASS |
| Bearer token middleware protects anime mutations | Invalid token returns 401 | `internal/api/router_test.go > TestPatchAnimeWithInvalidTokenReturnsUnauthorized` | PASS |
| Anime routes enforce asymmetric sync policy | POST /api/animes is blocked | `internal/api/router_test.go > TestPostAnimesWithoutTokenReturnsMethodNotAllowed` | PASS |
| Anime routes enforce asymmetric sync policy | DELETE /api/animes/:id is blocked | `internal/api/router_test.go > TestDeleteAnimeWithoutTokenReturnsMethodNotAllowed` | PASS |
| Anime routes enforce asymmetric sync policy | PATCH /api/animes/:id remains the only allowed mutation route | `internal/api/router.go` routes PATCH through auth and returns explicit deferred response | PASS |
| Method enforcement precedes auth for disallowed anime methods | Disallowed method without token still returns 405 | `internal/api/router_test.go > TestPostAnimesWithoutTokenReturnsMethodNotAllowed` | PASS |

## Test Run

```text
go test ./...
ok  autoreas-bridge
ok  autoreas-bridge/internal/anime
ok  autoreas-bridge/internal/anime/domain
ok  autoreas-bridge/internal/api
ok  autoreas-bridge/internal/device
ok  autoreas-bridge/internal/events
ok  autoreas-bridge/internal/sync
ok  autoreas-bridge/internal/tracerbullet
```

## Lint

```text
golangci-lint run
```

No output; clean run.

## Vet

```text
go vet ./...
```

No output; clean run.

## Additional Notes

- During verification, `internal/anime/watcher_integration_test.go` exposed a pre-existing race/flakiness around watcher startup on Windows. The test was stabilized with a short post-start wait and then stress-run with `-count=5`.
- `POST /api/devices/pair` now depends on a persisted pairing token. Pairing-token generation and UI exposure remain open for a later change.
- `PATCH /api/animes/:id` intentionally does not mutate `animes.dat` yet; that business path belongs to SDD-10.

## Files Changed

- `internal/api/server.go` — embedded HTTP server bootstrap/shutdown
- `internal/api/router.go` — routing, method guards and bearer auth
- `internal/api/router_test.go` — HTTP behavior tests for 400/401/405/201
- `internal/device/service.go` — pairing/auth service
- `internal/device/service_test.go` — service tests with fakes
- `internal/device/sqlite_store.go` — SQLite persistence for pairing tokens and devices
- `internal/device/sqlite_store_test.go` — integration tests over real SQLite
- `internal/sync/sqlite_bootstrap.go` — additive schema for `pairing_tokens` and `devices`
- `internal/sync/sqlite_bootstrap_test.go` — bootstrap coverage for new tables
- `app.go` — lifecycle wiring for HTTP server + device service
- `app_test.go` — startup/shutdown coverage for HTTP lifecycle
- `internal/anime/watcher_integration_test.go` — flake stabilization uncovered during verify
