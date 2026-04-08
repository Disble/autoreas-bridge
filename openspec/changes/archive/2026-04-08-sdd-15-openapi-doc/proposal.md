# Proposal: SDD-15 OpenAPI Static Documentation

## Intent
Add a static `docs/openapi.yaml` documenting the bridge REST API to ensure client integrations remain reliable. To prevent documentation drift, implement a `tools/checkopenapi` Go CLI pre-commit gate that validates the YAML is parseable and that every REST path registered in `router.go` is documented.

## Scope
**In Scope:**
- Documenting `POST /api/devices/pair`, `PATCH /api/animes/{id}`, and `POST /api/sync/reconcile`.
- Normalization of router paths (e.g., `/api/animes/` mapped to `/api/animes/{id}`).
- Pre-commit verification of REST path parity between `router.go` and `openapi.yaml`.

**Explicitly Excluded:**
- Blocked 405 endpoints (`POST /api/animes`, `DELETE /api/animes/{id}`) are excluded from the OpenAPI doc.
- The WebSocket endpoint `/ws` is excluded from the REST path parity check (though it may be optionally documented as an extension/AsyncAPI note).

## Approach
1. Create a static `docs/openapi.yaml` defining the API endpoints, request/response schemas, and authentication methods.
2. Build `tools/checkopenapi`, a Go script that:
   - Parses the YAML to extract documented paths using `gopkg.in/yaml.v3`.
   - Scans `router.go` to extract registered paths using string matching or regex.
   - Applies normalization rules to match Go router paths with OpenAPI template paths.
   - Fails with a clear error message (and `os.Exit(1)`) if a Go path is missing from the YAML.
3. Integrate the script into `lefthook.yml` as a pre-commit job.

## Dependencies
- Add `gopkg.in/yaml.v3` as a direct dependency to ensure robust YAML parsing in the `checkopenapi` tool.

## Risks
- **Brittleness of Path Extraction:** Using regex or string scanning to find registered paths in `router.go` may break if the router initialization syntax is refactored.
- **Schema Drift:** The parity check only validates the existence of paths, meaning request/response payload structures in the YAML could still drift from the Go implementation over time.

## Out of Scope
- Serving Swagger UI or Redoc via the bridge server.
- Runtime validation of incoming requests or outgoing responses against the OpenAPI schema.
- Generating Go code (models or routers) from the OpenAPI specification.
