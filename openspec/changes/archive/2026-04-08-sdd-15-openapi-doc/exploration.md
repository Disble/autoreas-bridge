## Exploration: sdd-15-openapi-doc

### 1. Router — path extraction feasibility

#### File read
- `internal/api/router.go` was read in full.

#### Registered routes in `NewHandler`
Exact `ServeMux` registrations:

1. `mux.HandleFunc("/api/devices/pair", h.handlePairDevice)`
2. `mux.HandleFunc("/api/animes", h.handleAnimes)`
3. `mux.HandleFunc("/api/animes/", h.handleAnimeByID)`
4. `mux.HandleFunc("/api/sync/reconcile", h.handleSyncReconcile)`
5. `mux.Handle("/ws", apiHandlers.NewWebSocketHandler(...))` — conditional on `config.RealtimeHub != nil`

#### Static extraction feasibility
- **Current code can be extracted with simple regex/string parsing** because every registered path is a string literal passed directly to `mux.HandleFunc(...)` or `mux.Handle(...)`.
- No concatenation, constants, helper vars, `fmt.Sprintf`, multiline expression building, or computed route tables are used.
- A regex that looks for `mux\.Handle(Func)?\("([^"]+)"` would capture all current path literals.

#### Edge cases in router semantics
- `"/api/animes/"` is a **prefix-style path** in `http.ServeMux`, not a literal REST leaf. It is used to dispatch dynamic IDs via `strings.TrimPrefix(r.URL.Path, "/api/animes/")`.
- Because of that, the OpenAPI path should be modeled as **`/api/animes/{id}`**, not as literal `/api/animes/`.
- `"/api/animes"` and `"/api/animes/"` are distinct registrations and both matter.
- `"/ws"` is a WebSocket upgrade endpoint, not a normal JSON REST endpoint.
- `"/ws"` is only registered when `RealtimeHub != nil`; a source cross-check sees it in code, but runtime availability is conditional.
- `handleAnimeByID` rejects empty suffixes: if the trimmed ID is empty, request falls to `404 Not Found`.
- Trailing slash behavior matters:
  - `/api/animes` → blocked route, 405 for POST and also 405 for everything else today.
  - `/api/animes/anything` → dynamic anime route.
  - `/api/animes/` → reaches handler but becomes empty ID and returns 404.

#### Conclusion
- **For this repository state: regex parsing is sufficient.**
- **For future-proofing: AST parsing would be safer** if the team later moves routes into constants, helper builders, or grouped registration functions.

### 2. Existing tools pattern

#### Files read
- `tools/checksdd/main.go` read in full.
- `tools/checkgofmt/main.go` read in full.

#### Shared conventions observed
- Both tools are single-file `package main` CLIs.
- Both start with `root, err := os.Getwd()`.
- Both centralize fatal exits through a local `fail(context string, err error)` helper.
- `fail(...)` writes to `stderr` using `fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)` and exits with `os.Exit(1)`.
- Successful no-op / pass conditions print a single human-readable line to `stdout`.
- They use stdlib heavily and avoid framework CLIs.

#### `tools/checksdd` exact behavior
- Detects active change from `.atl/active-sdd-change` first.
- Falls back to scanning `openspec/changes/` for exactly one non-archive directory.
- If no active change exists: prints `No active SDD change detected; skipping SDD gate.` and exits 0.
- Validation failures are returned as `error` and then routed through `fail("validate active SDD change", err)`.
- Validation style:
  - required file existence via `os.Stat`
  - tree walking via `filepath.Walk`
  - whole-file reads via `os.ReadFile`
  - regex-based content checks (`incompleteTaskPattern`, `verdictPattern`)
- Pass output: `SDD gate passed for <change>.`

#### `tools/checkgofmt` exact behavior
- Collects `.go` files via `filepath.WalkDir`.
- Skips directories `.git`, `node_modules`, `vendor`.
- Uses `filepath.Rel(root, path)` so `gofmt -l` receives repo-relative paths.
- If no Go files: prints `No Go files found; skipping gofmt check.` and exits 0.
- Runs external command `gofmt -l <files...>` with `exec.Command` and `cmd.Dir = root`.
- If command execution itself fails, it includes trimmed command output in the fail context string.
- If command succeeds but outputs filenames, tool prints:
  - `Unformatted Go files detected:` to `stderr`
  - offending paths
  - exits 1 directly
- Pass output: `Go formatting check passed.`

#### Implications for `tools/checkopenapi`
To match existing conventions, `checkopenapi` should:
- be a small `package main` tool under `tools/checkopenapi/main.go`
- resolve repo root with `os.Getwd()`
- use stdlib file walking / reading
- print one-line skip/pass messages to stdout
- print actionable failures to stderr and exit 1
- use a shared local `fail(...)` helper identical in style
- avoid fancy logging or multi-package scaffolding unless required

### 3. Contracts — full type inventory

#### Files read
- `internal/api/contracts/contracts.go`
- `internal/api/handlers/anime_handler.go`
- `internal/api/handlers/sync_handler.go`
- `internal/api/handlers/websocket_handler.go`
- `internal/api/handlers/common.go`
- Supporting evidence also verified from:
  - `internal/api/router.go`
  - `internal/api/router_test.go`
  - `internal/api/handlers/anime_handler_test.go`
  - `internal/api/handlers/sync_handler_test.go`
  - `internal/api/websocket_test.go`
  - `internal/device/service.go`
  - `internal/realtime/message.go`
  - `internal/realtime/hub.go`
  - `internal/anime/domain/state_machine.go`

#### Contract types present

##### Shared contract types (`internal/api/contracts/contracts.go`)
- `ErrAnimeNotFound = errors.New("anime not found")`
- `type AnimePatch struct {`
  - `Estado *int` → JSON `estado`, optional
  - `NroCapVisto *float64` → JSON `nrocapvisto`, optional
  - `Dias []string` → JSON `dias`, optional
  - `}`
- `type EffectiveAnime struct {`
  - `ID string`
  - `TotalCap *float64`
  - `Activo *bool`
  - `SnapshotJSON []byte`
  - `}`

#### Endpoint inventory

##### Endpoint A — `POST /api/devices/pair`
- **Registered path:** `/api/devices/pair`
- **Handler:** `handlePairDevice`
- **HTTP methods accepted:** `POST` only
- **Other methods:** `405 Method Not Allowed`
- **Auth required:** **No bearer auth**

###### Request body schema
Decoded into anonymous struct:
- `pairing_token` — string, required by service semantics
- `device_name` — string, required by service semantics

###### Request validation behavior
- JSON decoded with `json.Decoder` + `DisallowUnknownFields()`.
- Invalid JSON → `400 {"error":"invalid request body"}`
- Unknown top-level fields → same `400 invalid request body`
- Empty or whitespace `pairing_token` or `device_name` are rejected by `device.Service.PairDevice(...)` with `device.ErrInvalidPairingRequest` → `400 {"error":"invalid pairing request"}`
- No explicit max length / format / pattern constraints are implemented.

###### Success response
- **201 Created**
- JSON body:
  - `device_id` — string
  - `device_name` — string
  - `auth_token` — string

###### Error responses observed/implemented
- **400 Bad Request**
  - `{"error":"invalid request body"}` for JSON/unknown-field decode failure
  - `{"error":"invalid pairing request"}` for service-level invalid payload (empty trimmed fields)
- **401 Unauthorized**
  - `{"error":"invalid pairing token"}` when service returns `device.ErrInvalidPairingToken`
- **405 Method Not Allowed**
  - `{"error":"method not allowed"}` for non-POST methods
- **500 Internal Server Error**
  - `{"error":"pair device failed"}` for any other service error

###### Status codes not implemented here
- **200**: not used
- **202**: not used
- **404**: not used

###### Notes
- Response token is a bearer token for later authenticated routes.

##### Endpoint B — `/api/animes`
- **Registered path:** `/api/animes`
- **Handler:** `handleAnimes`
- **HTTP methods accepted for business success:** none
- **Implemented behavior today:** always `405 Method Not Allowed`
- **Auth required:** no, because method rejection happens before auth

###### Request body schema
- None documented/used.

###### Responses
- **405 Method Not Allowed**
  - `{"error":"method not allowed"}` for `POST`
  - also same 405 for every other method today because function unconditionally ends with `writeMethodNotAllowed`

###### Status codes not implemented here
- **200/201/202/400/401/404/500**: none on current code path

###### Notes
- Specs explicitly care about blocking `POST /api/animes`.
- This route exists mainly as an asymmetric-sync guardrail.

##### Endpoint C — `PATCH /api/animes/{id}` via registered prefix `/api/animes/`
- **Registered router path literal:** `/api/animes/`
- **OpenAPI path representation:** `/api/animes/{id}`
- **Handler chain:** `handleAnimeByID` → `patchAnime.ServeHTTP(...)` → `NewPatchAnimeHandler(...)`
- **HTTP methods accepted:** `PATCH` only for business handling
- **Explicitly blocked method:** `DELETE` → 405
- **All other methods:** 405
- **Auth required:** **Yes**, bearer token in `Authorization: Bearer <token>`

###### Path parameter
- `id` — string, required, extracted by trimming `/api/animes/` prefix from `r.URL.Path`
- Empty ID (`/api/animes/`) returns `404 Not Found` via `http.NotFound`
- No regex/pattern constraint on ID is implemented

###### Request body schema
Decoded as `map[string]json.RawMessage` with `DisallowUnknownFields()` on decoder.
Recognized fields only:
- `estado` — integer, optional
  - valid range **0..3 inclusive**
  - invalid type or out-of-range → `400 invalid estado`
- `nrocapvisto` — number, optional
  - type `float64`
  - must be **>= 0**
  - fractional values allowed (e.g. `0.5`, `10.5`)
  - invalid type or negative → `400 invalid nrocapvisto`
- `dias` — array of strings, optional
  - unmarshaled as `[]string`
  - invalid type → `400 invalid dias`

###### Unknown-field behavior
- IMPORTANT: because body is decoded into `map[string]json.RawMessage`, `DisallowUnknownFields()` does **not** reject unknown JSON keys.
- Example from tests/spec intent: `fechaUltCapVisto` is silently ignored, not rejected.
- Therefore request payload is effectively **open for extra properties**, but only `estado`, `nrocapvisto`, `dias` are applied.

###### Additional mutation rules
- After query, patch is passed through `domain.ApplyCompletionStateMachine(...)`.
- If `nrocapvisto` is present and `totalcap` is present and `totalcap > 0` and `nrocapvisto >= totalcap`, handler forces `estado = 1`.
- Client timestamps are ignored because only known fields are extracted.
- Inactive anime (`activo=false`) is allowed; test verifies it still patches successfully.
- Tombstoned / not found anime becomes 404 through query or patch service `ErrAnimeNotFound`.

###### Success response
- **200 OK**
- JSON body: `{"status":"ok"}`

###### Error responses observed/implemented
- **400 Bad Request**
  - `{"error":"invalid request body"}`
  - `{"error":"invalid estado"}`
  - `{"error":"invalid nrocapvisto"}`
  - `{"error":"invalid dias"}`
- **401 Unauthorized**
  - `{"error":"missing bearer token"}` when Authorization header missing/invalid format/empty token
  - `{"error":"invalid bearer token"}` when auth service rejects token
- **404 Not Found**
  - `{"error":"anime not found"}` when query or patch resolves to not found/tombstoned anime
  - plain `http.NotFound` response for empty path suffix case `/api/animes/`
- **405 Method Not Allowed**
  - `{"error":"method not allowed"}` for `DELETE` and any non-PATCH methods handled by router
- **500 Internal Server Error**
  - `{"error":"query anime failed"}` when lookup fails unexpectedly
  - `{"error":"patch anime failed"}` when write fails unexpectedly

###### Status codes not implemented here
- **201**: not used
- **202**: not used

##### Endpoint D — `POST /api/sync/reconcile`
- **Registered path:** `/api/sync/reconcile`
- **Handler chain:** `handleSyncReconcile` → `syncReconcile.ServeHTTP(...)`
- **HTTP methods accepted:** `POST` only
- **Other methods:** `405 Method Not Allowed`
- **Auth required:** **Yes**, bearer token in `Authorization: Bearer <token>`

###### Request body schema
- No body required or decoded.

###### Success response
- **202 Accepted**
- JSON body: `{"status":"accepted"}`

###### Error responses observed/implemented
- **401 Unauthorized**
  - `{"error":"missing bearer token"}`
  - `{"error":"invalid bearer token"}`
- **405 Method Not Allowed**
  - `{"error":"method not allowed"}` for non-POST methods
- **500 Internal Server Error**
  - `{"error":"trigger reconcile failed"}` if trigger function errors

###### Status codes not implemented here
- **200/201/400/404**: not used in current implementation

##### Endpoint E — `GET /ws` WebSocket upgrade endpoint
- **Registered path:** `/ws`
- **Registration type:** `mux.Handle(...)`
- **Only registered when:** `config.RealtimeHub != nil`
- **Protocol:** WebSocket upgrade, not standard REST JSON
- **Nominal HTTP method in clients/tests:** GET during handshake
- **Auth required:** **Yes**
  - primary: `Authorization: Bearer <token>`
  - fallback: query string `?token=<token>`

###### Auth behavior
- If no bearer token and no `?token=` → `401 {"error":"missing bearer token"}`
- If provided token is invalid → `401 {"error":"invalid bearer token"}`

###### Upgrade / runtime behavior
- If handler config invalid (`Authenticate == nil` or `Hub == nil`) → plain `http.Error("websocket unavailable", 503)`
- On successful auth + upgrade:
  - connection registered in realtime hub
  - hub immediately enqueues control message:
    - `{ "type": "sync_required", "reason": "connection_gap_assumed" }`
  - later broadcasts can send:
    - `{ "type": "anime_changed", "anime_id": "...", "payload": <raw JSON> }`
- Handler then loops on `conn.ReadMessage()` until client disconnects.

###### Message schemas
Control message (`internal/realtime/message.go`):
- `type` — string, required; current constant `sync_required`
- `reason` — string, optional; current constant `connection_gap_assumed`

Anime changed message:
- `type` — string, required; current constant `anime_changed`
- `anime_id` — string, required
- `payload` — raw JSON, optional

###### HTTP status codes relevant to handshake
- **101 Switching Protocols** on successful upgrade (implicit via Gorilla WebSocket upgrader)
- **401 Unauthorized** on auth failures
- **503 Service Unavailable** when websocket handler unavailable

###### Status codes from requested inventory not relevant / not implemented
- **200/201/202/400/404/405/500** are not normal successful websocket contract statuses here

###### Notes
- This path is API-adjacent but not a normal OpenAPI REST operation.
- If documented in OpenAPI at all, it likely belongs as a non-validated extension/note, not in the strict REST cross-check.

### 4. lefthook.yml

#### File read
- `lefthook.yml` was read in full.

#### Exact structure
Current file:

```yaml
pre-commit:
  parallel: false
  jobs:
    - name: gofmt
      run: go run ./tools/checkgofmt

    - name: golangci-lint
      run: golangci-lint run

    - name: go-vet
      run: go vet ./...

    - name: go-test
      run: go test ./...

    - name: go-cover
      run: go test ./... -cover

    - name: sdd-gate
      run: go run ./tools/checksdd
```

#### Conventions to mirror for new job
- Top-level hook is `pre-commit`.
- Jobs are ordered list items with two keys: `name` and `run`.
- `parallel: false` means order matters.
- Tool jobs use `go run ./tools/<toolname>`.

#### Implication for new job
`checkopenapi` should fit as another job entry like:

```yaml
    - name: openapi
      run: go run ./tools/checkopenapi
```

Placement is a proposal decision, but format MUST match the above style.

### 5. Go module

#### File read
- `go.mod` was read in full.

#### Observations
- Module: `autoreas-bridge`
- Go version: **`go 1.25.0`**

#### YAML dependency inventory
- No direct YAML package dependency is present.
- No `gopkg.in/yaml.v3` dependency exists.
- No other YAML parser is visible in `go.mod`.

#### Implication for `checkopenapi`
- If the tool must parse `openapi.yaml` semantically as YAML, a new YAML dependency would be required unless the file format is constrained.
- Cheapest common option would be `gopkg.in/yaml.v3`, but it is **not already present**.
- If the team wants **stdlib only**, the validator has two realistic paths:
  1. use a JSON OpenAPI file instead of YAML; or
  2. keep YAML but parse only a narrowly constrained subset with string/regex scanning.

### 6. Existing docs/

#### Directory check
- `docs/` exists.

#### Files currently under `docs/`
- `docs/autoreas-bridge-design-doc.md`
- `docs/autoreas-bridge-rfc.md`
- `docs/architecture.md`
- `docs/sdd-tree.md`
- `docs/tracer-bullet-plan.md`

#### Existing OpenAPI / Swagger artifacts
- No `openapi.yaml`, `openapi.yml`, `openapi.json` found anywhere in repo.
- No `swagger.yaml`, `swagger.yml`, `swagger.json` found anywhere in repo.

### 7. Gap analysis

#### 7.1 Can `router.go` paths be extracted with a simple regex, or does it need AST parsing?
- **Answer: simple regex is enough for the current file.**
- Why:
  - all route registrations are direct literal string arguments
  - all are spelled in one place in `NewHandler`
  - only `mux.HandleFunc` and `mux.Handle` are used
- Caveat:
  - regex should only extract registered literals, then a post-processing rule must normalize `/api/animes/` → `/api/animes/{id}` for REST documentation purposes.
- Future risk:
  - AST parsing becomes necessary if routes later move to constants/variables/helpers.

#### 7.2 Exact list of paths that MUST appear in `openapi.yaml`
For REST coverage, these are the paths that MUST be represented:

1. `/api/devices/pair`
   - method: `post`
2. `/api/animes`
   - method: at minimum `post` documented as blocked / method-not-allowed if the cross-check expects every registered route to be represented
3. `/api/animes/{id}`
   - method: `patch`
   - method: optionally `delete` documented as blocked/405 if the doc is intended to capture enforced contract, not just successful operations
4. `/api/sync/reconcile`
   - method: `post`

Important nuance:
- If the OpenAPI strategy documents only **supported operations**, then only these successful operations are mandatory:
  - `POST /api/devices/pair`
  - `PATCH /api/animes/{id}`
  - `POST /api/sync/reconcile`
- But the user asked for a cross-check against router paths, and router/specs explicitly care about blocked methods too. So proposal/spec must decide one of two policies:
  - **Path-level parity only**: all registered path shapes appear; methods may be subset.
  - **Path+method parity including enforced 405s**: document blocked operations too.

#### 7.3 What paths should be EXCLUDED from the cross-check?
- **Exclude `/ws` from strict REST OpenAPI cross-check**.
  - Reason: it is a WebSocket upgrade endpoint, not a normal REST/JSON operation.
  - Additional reason: registration is conditional on `RealtimeHub != nil`.
- Do **not** exclude `/api/animes` just because it only returns 405 today; it is still part of the enforced HTTP contract.
- Do **not** exclude `/api/animes/` route shape; instead normalize it to `/api/animes/{id}`.

#### 7.4 Can `checkopenapi` use only Go stdlib to parse YAML, or does it need a YAML library?
- **For true YAML parsing: it needs a YAML library.** Stdlib has no YAML parser.
- `encoding/json` cannot parse YAML.
- `strings/regexp` can only do brittle textual checks.

Best options:

1. **Recommended:** add `gopkg.in/yaml.v3`
   - Pros: robust structural parse of `paths`, operations, responses
   - Cons: new dependency

2. **Alternative:** require `openapi.json` instead of YAML
   - Pros: stdlib-only with `encoding/json`
   - Cons: conflicts with requested filename `openapi.yaml` if that is fixed

3. **Fallback:** text/regex scan of a tightly controlled YAML file
   - Pros: stdlib-only
   - Cons: fragile against indentation, anchors, comments, multiline values, quoted keys, path ordering

Given the mission is a gate tool, FRAGILE parsing is a bad fit. If file must be `openapi.yaml`, adding YAML parsing is the safer architecture.

#### 7.5 Risks / edge cases in cross-check logic

1. **Dynamic path normalization**
   - Router literal is `/api/animes/` but OpenAPI path should be `/api/animes/{id}`.
   - Tool must normalize prefix route into templated path or it will false-fail.

2. **WebSocket false positives**
   - `/ws` is code-visible but should not force REST OpenAPI coverage.
   - Conditional registration makes naive extraction even noisier.

3. **Method vs path ambiguity**
   - Router registers paths, but methods are enforced inside handlers.
   - Static route extraction alone cannot infer allowed methods; checkopenapi must either:
     - use explicit hardcoded expectations, or
     - parse handler logic too, or
     - validate path presence only.

4. **Blocked-method documentation policy**
   - `/api/animes` exists only to return 405.
   - Proposal/spec must decide whether OpenAPI SHALL document blocked operations.

5. **Unknown-field behavior mismatch**
   - Pairing endpoint truly rejects unknown fields because it decodes into struct with `DisallowUnknownFields()`.
   - Anime PATCH does **not** reject unknown fields due to map decoding.
   - OpenAPI schema should not claim `additionalProperties: false` for PATCH unless implementation changes.

6. **404 variant mismatch on `/api/animes/`**
   - Empty suffix returns plain `http.NotFound`, not JSON error wrapper.
   - OpenAPI may document 404 for `/api/animes/{id}`, but runtime has a special malformed-path case outside the templated contract.

7. **Conditional runtime availability**
   - `/ws` exists only when realtime hub is configured.
   - Any validator must know whether it validates source contract or runtime configuration.

8. **Response-code completeness vs real behavior**
   - User requested inventory for `200/201/202/400/401/404/405/500`, but not every endpoint uses all of them.
   - OpenAPI should avoid inventing unsupported codes unless explicitly documenting umbrella error behavior.

9. **YAML parsing fragility if stdlib-only**
   - Regex-based YAML parsing will be brittle and high-maintenance for a pre-commit gate.

10. **ServeMux semantics**
   - `http.ServeMux` exact-vs-prefix matching semantics matter; `/api/animes/` is not the same kind of route as `/api/devices/pair`.
   - Tool must encode that semantic difference.

### Current State
The repo already has a small HTTP surface with direct `http.ServeMux` registration, thin handlers, explicit JSON error payloads, and lightweight repo-owned gate tools. There is no existing OpenAPI artifact or YAML dependency, and the only route that needs normalization is the `/api/animes/` prefix route that maps to `/api/animes/{id}`.

### Affected Areas
- `internal/api/router.go` — source of truth for registered HTTP paths
- `internal/api/handlers/anime_handler.go` — PATCH payload/response contract and validation rules
- `internal/api/handlers/sync_handler.go` — reconcile endpoint contract
- `internal/api/handlers/websocket_handler.go` — `/ws` upgrade behavior and exclusion rationale
- `internal/api/contracts/contracts.go` — reusable API field/type definitions
- `tools/checksdd/main.go` — repo-owned gate style reference
- `tools/checkgofmt/main.go` — repo-owned gate style reference
- `lefthook.yml` — pre-commit job registration pattern
- `go.mod` — dependency and Go version constraints

### Approaches
1. **Regex route extraction + YAML structural parse** — Extract route literals from `router.go`, normalize known dynamic routes, and parse `openapi.yaml` with a YAML library.
   - Pros: simplest implementation that still stays robust enough for a gate; matches current router style; low code volume.
   - Cons: adds one YAML dependency; method inference still needs explicit expectations or path-only validation.
   - Effort: Medium

2. **AST route extraction + YAML structural parse** — Use Go AST for routes and a YAML library for OpenAPI.
   - Pros: more future-proof if route declarations become indirect.
   - Cons: more code and complexity than current repo needs.
   - Effort: Medium/High

3. **Regex route extraction + regex YAML scan** — Keep tool stdlib-only by text-scanning both Go and YAML.
   - Pros: no new dependency.
   - Cons: fragile, noisy, poor fit for a pre-commit gate, likely to break on harmless doc formatting changes.
   - Effort: Low initially, High maintenance

### Recommendation
Use **regex/string extraction for `router.go` plus a real YAML parser** for `openapi.yaml`. That gives the cheapest implementation that is still trustworthy in a pre-commit gate. Normalize `/api/animes/` to `/api/animes/{id}`, exclude `/ws` from the strict REST cross-check, and make the policy explicit on whether blocked 405 operations must appear as documented operations or only as documented path notes.

### Risks
- Ambiguity over whether blocked methods (`POST /api/animes`, `DELETE /api/animes/{id}`) must be first-class OpenAPI operations.
- False failures if `/api/animes/` is compared literally instead of normalized to `/api/animes/{id}`.
- Fragility if YAML is parsed with regex instead of a YAML parser.
- Future router refactors could outgrow regex extraction.

### Ready for Proposal
Yes — the exploration is complete enough to draft proposal/spec/design for a static `openapi.yaml` plus `tools/checkopenapi` gate. The proposal should explicitly settle the cross-check policy for blocked methods and confirm `/ws` exclusion from REST validation.
