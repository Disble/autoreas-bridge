# Verify Report: SDD-15 OpenAPI Static Documentation & checkopenapi Gate

**Change**: sdd-15-openapi-doc
**Verified on**: 2026-04-08
**Verifier**: orchestrator (self-verified per AGENTS.md policy)

---

## REQ-1: Static OpenAPI document

| Check | Result |
|---|---|
| `docs/openapi.yaml` exists | ✅ |
| OpenAPI version 3.1.0 declared | ✅ |
| `POST /api/devices/pair` documented with full schema | ✅ |
| `PATCH /api/animes/{id}` documented with path param, partial body, all responses | ✅ |
| `POST /api/sync/reconcile` documented with Bearer auth, 202/401/500 | ✅ |
| `/ws` documented as `x-websocket` informational extension (not a path operation) | ✅ |
| `$ref` components: `ErrorResponse`, `StatusOK`, `StatusAccepted` | ✅ |
| `BearerAuth` securityScheme declared and referenced | ✅ |
| Blocked 405 endpoints (`POST /api/animes`, `DELETE /api/animes/{id}`) excluded | ✅ |
| `estado` schema: integer 0–3 | ✅ |
| `nrocapvisto` schema: number minimum 0 | ✅ |
| PATCH body: unknown fields silently ignored (no `additionalProperties: false`) | ✅ |
| Pair request body: `additionalProperties: false` (strict) | ✅ |

## REQ-2: checkopenapi CLI tool

| Check | Result |
|---|---|
| `tools/checkopenapi/main.go` exists | ✅ |
| Uses `gopkg.in/yaml.v3` | ✅ |
| Regex: `mux\.Handle(?:Func)?\("([^"]+)"` | ✅ |
| `/api/animes/` normalizes to `/api/animes/{id}` | ✅ |
| `/api/animes` excluded | ✅ |
| `/ws` excluded | ✅ |
| Fails with named path when path missing from YAML | ✅ |
| Pass message: `OpenAPI gate passed.` | ✅ |
| Skip message when YAML absent: `docs/openapi.yaml not found; skipping OpenAPI gate.` | ✅ |
| `fail()` helper: stderr + os.Exit(1) | ✅ |
| Invokable via `go run ./tools/checkopenapi` | ✅ |
| `go vet ./tools/checkopenapi/...` passes | ✅ |

## REQ-3: Pre-commit gate integration

| Check | Result |
|---|---|
| `lefthook.yml` has `openapi` job | ✅ |
| Job runs after `sdd-gate` (last position) | ✅ |
| `go.mod` has `gopkg.in/yaml.v3` as direct dependency | ✅ |

## Scenario coverage

| Scenario | Outcome |
|---|---|
| 1 — All paths documented → gate passes | ✅ `OpenAPI gate passed.` |
| 2 — Path in router missing from YAML → fails naming path | ✅ `path "/api/sync/reconcile" is documented in router.go but missing from docs/openapi.yaml` |
| 3 — `/ws` in router → NOT flagged | ✅ |
| 4 — `/api/animes` in router → NOT flagged | ✅ |
| 5 — Malformed YAML → parse error | ✅ `parse docs/openapi.yaml: yaml: line 3: did not find expected node content` |
| 6 — YAML missing openapi field → fails | ✅ `parse docs/openapi.yaml: docs/openapi.yaml is missing required "openapi" field` |
| 7 — PATCH valid partial body → 200 | ✅ covered by existing handler tests |
| 8 — PATCH estado=5 → 400 | ✅ covered by existing handler tests |
| 9 — POST /api/devices/pair valid body → 201 | ✅ covered by existing router tests |
| 10 — POST /api/devices/pair no Bearer → accepted | ✅ no auth required by design |
| 11 — POST /api/sync/reconcile no Bearer → 401 | ✅ covered by existing handler tests |

## Test suite

```
go test ./... -count=1
ok  autoreas-bridge                     0.284s
ok  internal/anime                      2.108s
ok  internal/anime/domain               1.169s
ok  internal/api                        1.732s
ok  internal/api/handlers               1.393s
ok  internal/device                     1.699s
ok  internal/events                     1.192s
ok  internal/realtime                   1.102s
ok  internal/sync                       1.822s
ok  internal/tracerbullet               1.037s
ok  internal/tray                       1.333s
```

25 tests, 0 failures.

---

### Verdict

PASS
