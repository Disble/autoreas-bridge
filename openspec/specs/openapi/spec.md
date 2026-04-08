# Specification: OpenAPI Static Documentation & checkopenapi Gate

## 1. Requirements

### REQ-1: Static OpenAPI document
- `docs/openapi.yaml` must exist at the repository root.
- The document must be valid OpenAPI 3.1.0.
- It must document exactly the following endpoints:
  - `POST /api/devices/pair`
  - `PATCH /api/animes/{id}`
  - `POST /api/sync/reconcile`
- The WebSocket endpoint (`/ws`) must be documented as an informational note (not as a REST operation).
- Must use `$ref` components for reusable schemas, specifically:
  - `ErrorResponse`
  - `BearerAuth` security scheme
- All request bodies, path parameters, and response schemas must be accurate per the verified API contracts:
  - **POST /api/devices/pair**: No auth. Requires `pairing_token` (string) and `device_name` (string) in body. Returns 201 (`{device_id, device_name, auth_token}`), 400, 401, 500. Unknown body fields must be rejected (400).
  - **PATCH /api/animes/{id}**: Bearer auth required. Path param `id` (string). Optional body fields: `estado` (integer 0-3), `nrocapvisto` (number >= 0), `dias` (array of strings). Unknown fields are silently ignored. Returns 200 (`{status: "ok"}`), 400, 401, 404, 500.
  - **POST /api/sync/reconcile**: Bearer auth required. No request body. Returns 202 (`{status: "accepted"}`), 401, 500.

### REQ-2: `checkopenapi` CLI tool
- Must be located at `tools/checkopenapi/main.go`.
- Must use `gopkg.in/yaml.v3` to parse `docs/openapi.yaml`.
- Must extract registered paths from `internal/api/router.go` via regex: `mux\.Handle(?:Func)?\("([^"]+)"`.
- Must apply the following normalization and exclusion rules to extracted paths:
  - `/api/animes/` normalizes to `/api/animes/{id}`.
  - `/api/animes` is excluded (always 405).
  - `/ws` is excluded.
- Must fail with an actionable error message naming the missing path if any required path is missing from the YAML.
- Must pass silently (printing a single short stdout pass message: `OpenAPI gate passed.`) if all paths are covered.
- If `docs/openapi.yaml` is truly missing, it must print `docs/openapi.yaml not found; skipping OpenAPI gate.` and pass (do not fail silently in normal operation).
- Must follow existing `tools/` conventions exactly:
  - `package main`
  - Use `os.Getwd()` for root directory detection.
  - Use `fail(context string, err error)` helper which prints to `stderr` and calls `os.Exit(1)`.
  - Invoked via `go run ./tools/checkopenapi`.

### REQ-3: Pre-commit gate integration
- `lefthook.yml` must be updated with a new job named `openapi` running `go run ./tools/checkopenapi`.
- The `openapi` job must run after the `sdd-gate` (in the last position).
- `go.mod` must be updated to include `gopkg.in/yaml.v3` as a direct dependency.

## 2. Scenarios

**Scenario 1: All paths documented**
- **Given** `router.go` registers paths and `openapi.yaml` documents them all.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate passes with message `OpenAPI gate passed.`.

**Scenario 2: Missing path in YAML**
- **Given** a new path `/api/health` is added to `router.go` but not to `openapi.yaml`.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate fails with an actionable message naming the missing path `/api/health`.

**Scenario 3: /ws is excluded**
- **Given** `/ws` is present in `router.go`.
- **When** the `checkopenapi` tool extracts paths.
- **Then** `/ws` is NOT flagged as missing from the REST paths in YAML.

**Scenario 4: /api/animes is excluded**
- **Given** `/api/animes` is present in `router.go`.
- **When** the `checkopenapi` tool extracts paths.
- **Then** `/api/animes` is NOT flagged as missing from the REST paths in YAML.

**Scenario 5: Malformed YAML**
- **Given** `docs/openapi.yaml` contains invalid YAML syntax.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate fails with a parse error message.

**Scenario 6: Missing OpenAPI version**
- **Given** `docs/openapi.yaml` is missing the required `openapi` version field.
- **When** `go run ./tools/checkopenapi` is executed.
- **Then** the gate fails indicating the missing version.

**Scenario 7: PATCH /api/animes/{id} - Valid partial body**
- **Given** an authenticated request to `PATCH /api/animes/123` with body `{"estado": 1}`.
- **When** the API processes the request.
- **Then** the response is `200 OK` with `{"status": "ok"}`.

**Scenario 8: PATCH /api/animes/{id} - Invalid estado**
- **Given** an authenticated request to `PATCH /api/animes/123` with body `{"estado": 5}`.
- **When** the API processes the request.
- **Then** the response is `400 Bad Request`.

**Scenario 9: POST /api/devices/pair - Valid body**
- **Given** an unauthenticated request to `POST /api/devices/pair` with `{"pairing_token": "abc", "device_name": "test"}`.
- **When** the API processes the request.
- **Then** the response is `201 Created` containing `device_id`, `device_name`, and `auth_token`.

**Scenario 10: POST /api/devices/pair - No auth required**
- **Given** a request to `POST /api/devices/pair` without a Bearer token.
- **When** the API processes the request.
- **Then** the request is accepted (no 401 Unauthorized for missing auth).

**Scenario 11: POST /api/sync/reconcile - Missing auth**
- **Given** a request to `POST /api/sync/reconcile` without a Bearer token.
- **When** the API processes the request.
- **Then** the response is `401 Unauthorized`.
