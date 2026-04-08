# Tasks: SDD-15 OpenAPI Static Documentation & checkopenapi Gate

## Phase 1: Dependency
- [x] 1.1 Add `gopkg.in/yaml.v3` as direct dependency via `go get gopkg.in/yaml.v3`
- [x] 1.2 Verify `go.mod` and `go.sum` updated correctly

## Phase 2: docs/openapi.yaml
- [x] 2.1 Create `docs/openapi.yaml` with OpenAPI 3.1.0 header, info block (title: Autoreas Bridge API, version: 1.0.0)
- [x] 2.2 Add `components/securitySchemes`: `BearerAuth` (type: http, scheme: bearer)
- [x] 2.3 Add `components/schemas`: `ErrorResponse` ({error: string}), `StatusOK` ({status: string}), `StatusAccepted` ({status: string})
- [x] 2.4 Add `POST /api/devices/pair` operation with full request body and all response schemas
- [x] 2.5 Add `PATCH /api/animes/{id}` operation with path param, partial body schema (`estado` 0-3, `nrocapvisto` >=0, `dias` array), all responses
- [x] 2.6 Add `POST /api/sync/reconcile` operation with Bearer security, no body, 202/401/500 responses
- [x] 2.7 Add WebSocket `/ws` as `x-websocket` extension block (informational only, not a path operation)

## Phase 3: tools/checkopenapi
- [x] 3.1 Create `tools/checkopenapi/main.go` with `package main`, imports
- [x] 3.2 Implement `openAPIDoc` struct with yaml tags (`openapi`, `info`, `paths`)
- [x] 3.3 Implement `extractPaths(routerFile string) ([]string, error)` — regex scan
- [x] 3.4 Implement `normalizePaths(raw []string) []string` — apply exclusion/normalization table
- [x] 3.5 Implement `parseYAMLPaths(yamlFile string) (map[string]bool, error)` — `yaml.v3` unmarshal, validate `openapi` field
- [x] 3.6 Implement `fail(context string, err error)` helper
- [x] 3.7 Implement `main()` — wire all functions, skip if YAML missing, fail on missing paths, print pass message

## Phase 4: Gate integration
- [x] 4.1 Add `openapi` job to `lefthook.yml` after `sdd-gate`
- [x] 4.2 Run `go vet ./tools/checkopenapi/...` to verify tool compiles
- [x] 4.3 Run `go run ./tools/checkopenapi` manually to verify gate passes with the new YAML

## Implementation notes
- Exact error messages to use in implementation:
  - Missing path: `path %q is documented in router.go but missing from docs/openapi.yaml`
  - Parse error: handled via `fail("parse docs/openapi.yaml", err)`
  - Missing openapi field: `docs/openapi.yaml is missing required "openapi" field`
  - Skip: `docs/openapi.yaml not found; skipping OpenAPI gate.`
  - Pass: `OpenAPI gate passed.`
