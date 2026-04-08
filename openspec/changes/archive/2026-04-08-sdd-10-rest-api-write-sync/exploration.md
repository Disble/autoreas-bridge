## Exploration: SDD-10 REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)

### Current State
- `internal/api/router.go` owns routing today; `PATCH /api/animes/:id` already exists but only authenticates and returns `501`. `api.Config` currently injects only `device.AuthService`, so the API layer cannot yet read anime state or trigger sync behavior.
- `app.go` is the real composition root. It already wires the event bus, startup catch-up, runtime watcher, append-only writer, changelog recorder, device service, and HTTP server. Any SDD-10 API dependency must be injected there.
- The anime write path is event-driven: `events.AnimeUpdateRequestedEvent` -> `internal/anime/updateWriter` -> append JSON line to `animes.dat` -> publish `AnimeChangedEvent`.
- Critical runtime constraint: the writer appends the payload as a **full JSON document**, not a diff. So the PATCH handler CANNOT publish sparse JSON like `{"nrocapvisto":12}`; it must first load the effective record, merge the patch, and publish a full canonical document or it will erase untouched fields on the next effective-state collapse.
- Effective anime state is already materialized durably in SQLite `anime_snapshots`. `internal/anime/parser.go` collapses `animes.dat` by `_id`, removes tombstones, and `internal/sync/anime_snapshot_store.go` persists only the surviving effective records. That makes `anime_snapshots` the best lookup source for API writes.
- Zombie/tombstone detection can piggyback on that same store: if an `_id` is absent from `anime_snapshots`, it is not in the effective state (either never existed or was tombstoned). `activo=false` remains present in the effective state, so inactive animes MUST remain patchable.
- `internal/sync/reconcile.go` is a pure function only. There is no sync application service yet. The only current runtime trigger shape related to reconcile is `events.SyncRequestedEvent`.
- Real fixture data in `resources/autoreas-data/animes.dat` confirms the fields SDD-10 must respect: `estado`, `totalcap`, fractional `nrocapvisto`, and dynamic `dias`. It also confirms the distinction between active/inactive records and the presence of legacy date wrappers.
- `internal/anime/domain/LegacyAnimeRaw` is the safest mutation vessel because it preserves untouched legacy fields through `extraFields`, but it does not currently expose typed access to `estado` or `totalcap`, and the API package cannot touch its unexported internals.
- Recommended PATCH payload shape: strict JSON with optional mutation fields such as `estado`, `nrocapvisto`, and `dias`, while server-owned timestamps are stamped in Go with `time.Now().UnixMilli()`. The main contract decision for proposal/spec is whether client-supplied timestamp fields should be accepted-and-ignored (to satisfy “discard clock skew”) or rejected as unknown transport fields.
- Suggested test matrix:
  - HTTP contract: 401 missing bearer, 404 zombie/missing anime, 400 malformed JSON, 400 invalid `estado`, 400 negative `nrocapvisto`, 405 precedence preserved, 200/204 valid PATCH, and `POST /api/sync/reconcile` auth + trigger behavior.
  - Business rules: fractional `nrocapvisto` accepted, `nrocapvisto >= totalcap > 0` forces `estado = 1`, `totalcap` nil/0 does not force completion, inactive anime still patches, tombstoned anime blocks.
  - Integration: load effective snapshot from SQLite, publish full merged JSON to writer path, verify trigger path for sync endpoint.

### Affected Areas
- `internal/api/router.go` — current PATCH placeholder and anime route guards live here; best immediate home for extracting the real handlers.
- `internal/api/server.go` — `api.Config` must grow to inject anime lookup/mutation and sync trigger dependencies.
- `app.go` — must wire the new API collaborators from existing anime/sync/event bus components.
- `internal/anime/writer.go` — defines the real write contract: append full JSON payload on `AnimeUpdateRequestedEvent`.
- `internal/anime/parser.go` — defines effective-state consolidation and tombstone semantics used for anti-zombie checks.
- `internal/sync/anime_snapshot_store.go` — current durable read model for effective anime state.
- `internal/anime/domain/anime_raw.go` — safest place to add typed support/accessors for `estado`, `totalcap`, `dias`, and server-owned timestamp mutation while preserving legacy fields.
- `internal/events/event.go` — already exposes `AnimeUpdateRequestedEvent` and `SyncRequestedEvent` that SDD-10 can orchestrate around.
- `internal/sync/reconcile.go` — pure engine that should be wrapped by a service/use case, not called directly from HTTP.
- `internal/api/router_test.go` — existing HTTP test suite to extend with PATCH and reconcile cases.
- `resources/autoreas-data/animes.dat` — real compatibility fixture proving the field names and cross-field edge cases that matter.

### Approaches
1. **Snapshot-backed merge/write service** — Add an anime application service that loads the effective snapshot from SQLite, decodes to legacy raw, validates and merges PATCH fields, stamps server time, forces `estado = 1` when `nrocapvisto >= totalcap > 0`, then publishes a full `AnimeUpdateRequestedEvent`.
   - Pros: Reuses the existing effective-state source, naturally blocks zombies, preserves untouched legacy fields, and matches the append-only writer contract.
   - Cons: Requires new service/repository interfaces and extending `LegacyAnimeRaw` for typed access to `estado`/`totalcap`.
   - Effort: Medium

2. **API-level generic JSON map mutation** — Have the handler read canonical JSON from `anime_snapshots`, mutate a `map[string]any`, enforce rules there, and publish merged JSON directly; make `POST /api/sync/reconcile` publish `SyncRequestedEvent`.
   - Pros: Fastest path to green for the HTTP adapter.
   - Cons: Pushes legacy schema knowledge into `internal/api`, weakens type safety, and makes cross-field/timestamp rules easier to get wrong or duplicate.
   - Effort: Medium

### Recommendation
Use **Snapshot-backed merge/write service**. The repo already has the correct building blocks: `anime_snapshots` as effective read model, `AnimeUpdateRequestedEvent` as the write command, and `LegacyAnimeRaw` as the only existing type designed to preserve unknown legacy fields. The proposal should introduce: (1) an API-facing anime lookup/mutation service, (2) typed/raw helpers for `estado`, `totalcap`, `dias`, and server-owned timestamps, and (3) a separate sync trigger service so `POST /api/sync/reconcile` triggers orchestration instead of trying to call the pure reconciler directly. That keeps HTTP thin and makes strict TDD practical: HTTP tests first, then service tests, then wiring.

### Risks
- The biggest trap is **partial-patch corruption**: publishing sparse JSON would silently drop untouched fields because the writer is append-only and effective state is last-line-wins.
- There is a contract tension between “strict transport shape” and “discard tablet timestamps”; the proposal/spec must pick whether timestamp fields are accepted-and-ignored or rejected as unknown input.
- `LegacyAnimeRaw` does not yet expose `estado`/`totalcap`, so proposal/design must account for model expansion or a dedicated read model to avoid leaking untyped JSON logic into the API adapter.
- `POST /api/sync/reconcile` has no existing sync service behind it; without adding one, the endpoint can only publish a trigger event, not perform a full reconcile use case itself.

### Ready for Proposal
Yes — the runtime shape is clear enough to propose a snapshot-backed anime mutation service plus a sync trigger service. The only real open decision is how strict/forgiving the PATCH decoder should be about client-supplied timestamp fields.
