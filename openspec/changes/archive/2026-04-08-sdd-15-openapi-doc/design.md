# Design: SDD-15 OpenAPI Static Documentation

## 1. Architecture overview

This change adds two build-time artifacts: a static `docs/openapi.yaml` and a repo-local CLI gate at `tools/checkopenapi/main.go`. The YAML is the source of truth for REST documentation; the CLI is the drift detector that compares documented paths against `internal/api/router.go` before commit. There is no runtime wiring into the HTTP server, no handler changes, and no dependency from application code to the OpenAPI document.

```text
router.go --extract paths--> checkopenapi <--parse YAML-- docs/openapi.yaml
                                      |
                                      +-- pass/fail in lefthook pre-commit
```

## 2. docs/openapi.yaml structure

- `openapi: 3.1.0` at the document root.
- `info` includes at least title and version; WebSocket support is described in `info.description` or an `x-websocket` note, not as a `paths` operation.
- `components.schemas.ErrorResponse` is the shared error payload and is reused via `$ref` in 400/401/404/500 responses.
- `components.securitySchemes.BearerAuth` uses `type: http` and `scheme: bearer`.
- `paths` are ordered as:
  1. `/api/devices/pair`
  2. `/api/animes/{id}`
  3. `/api/sync/reconcile`
- A YAML comment documents exclusions: `/api/animes` is intentionally omitted because it is a blocked 405 route, and `/ws` is intentionally omitted from REST path operations.

## 3. tools/checkopenapi design

The validator follows the existing `tools/` pattern (`package main`, `os.Getwd()`, `fail(context string, err error)`, single short stdout line on skip/pass).

```text
main()
  root = os.Getwd()
  yamlPath = root/docs/openapi.yaml
  if not exists -> print skip message, return
  routerPath = root/internal/api/router.go

  routerPaths = extractPaths(routerPath)
  requiredPaths = normalizePaths(routerPaths)

  specPaths = parseYAMLPaths(yamlPath)

  for each path in requiredPaths:
    if path not in specPaths -> fail with message

  print "OpenAPI gate passed."
```

Function responsibilities:

- `extractPaths(file string) ([]string, error)`
  - Reads `internal/api/router.go`.
  - Uses regex `mux\.Handle(?:Func)?\("([^"]+)"`.
  - Returns raw matched string literals in registration order.

- `normalizePaths(raw []string) []string`
  - Applies the fixed table:
    - `/api/devices/pair` -> require
    - `/api/animes` -> exclude
    - `/api/animes/` -> `/api/animes/{id}`
    - `/api/sync/reconcile` -> require
    - `/ws` -> exclude
  - Deduplicates while preserving first-seen order.

- `parseYAMLPaths(file string) (map[string]bool, error)`
  - Reads `docs/openapi.yaml`.
  - Unmarshals with `gopkg.in/yaml.v3` into a minimal struct.
  - Validates required top-level fields, then converts `doc.Paths` keys into `map[string]bool`.

- `fail(context string, err error)`
  - Writes `fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)`.
  - Exits with status 1.

## 4. YAML minimal struct for parsing

```go
type openAPIDoc struct {
    OpenAPI string                   `yaml:"openapi"`
    Info    struct{ Version string } `yaml:"info"`
    Paths   map[string]interface{}   `yaml:"paths"`
}
```

Validation rules:
- `openapi` MUST be non-empty.
- `paths` MUST be non-nil.

## 5. Error messages (exact wording)

- Missing path: `path %q is documented in router.go but missing from docs/openapi.yaml`
- Parse error: `parse docs/openapi.yaml: <err>`
- Missing openapi field: `docs/openapi.yaml is missing required "openapi" field`
- Read router error: `read internal/api/router.go: <err>`
- Skip: `docs/openapi.yaml not found; skipping OpenAPI gate.`
- Pass: `OpenAPI gate passed.`

## 6. Testing strategy

- No unit tests for `checkopenapi`, matching the existing `checksdd` and `checkgofmt` tooling style.
- Primary validation is execution of `go run ./tools/checkopenapi` through pre-commit.
- Spec scenarios are enforced by real gate behavior rather than isolated mocks.
- Verify phase will run one manual smoke test: execute the gate with the YAML present and confirm pass/fail behavior matches the documented scenarios.

## 7. Dependencies and go.mod impact

- Add `gopkg.in/yaml.v3 v3.x.x` as a direct dependency in `go.mod`.
- `go.sum` updates automatically when the dependency is fetched.
- No other dependency or runtime package changes are required.
