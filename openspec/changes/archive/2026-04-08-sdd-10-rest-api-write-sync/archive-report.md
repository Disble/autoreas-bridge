# Archive Report: SDD-10 REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)

**Change**: `sdd-10-rest-api-write-sync`
**Archived on**: 2026-04-08
**Commit**: `6f3e258 feat(api): add anime patch write service with anti-zombie and state machine (SDD-10)`
**Final Verdict**: PASS

## Summary

SDD-10 delivered the write-side REST API for anime updates and manual reconciliation triggers. The change implemented `PATCH /api/animes/:id` and `POST /api/sync/reconcile`, preserved append-only writer integrity through snapshot-backed full-payload merges, and enforced the anti-zombie and cross-field state machine rules required by the legacy runtime.

## Implemented Behavior

- `PATCH /api/animes/:id`
- `POST /api/sync/reconcile`
- Anti-zombie rule: absence from `anime_snapshots` means tombstoned/non-existent and MUST return `404`; `activo=false` remains patchable and returns `200`
- Cross-field state machine: `nrocapvisto >= totalcap > 0` forces `estado=1` (`Finalizado`)
- Clock skew rule: client timestamps are silently discarded; the server stamps `time.Now().UnixMilli()`
- Full payload integrity: snapshot-backed merge prevents partial-write corruption and always publishes the full canonical JSON payload

## Key Decisions

1. **Snapshot-backed write service**: the handler never publishes sparse PATCH JSON. The service loads the canonical snapshot, applies the patch, re-applies state-machine guards, and emits a full `AnimeUpdateRequestedEvent` payload.
2. **Anti-zombie by absence, not by `activo`**: the runtime truth for writability is presence in `anime_snapshots`. Missing rows are tombstoned/non-existent; inactive rows still exist.
3. **Server-owned clocks**: transport timestamps are intentionally ignored to prevent Android/client clock skew from corrupting ordering semantics.
4. **Cross-field guard at API boundary and service boundary**: the completion rule is enforced before dispatch and again after merge, making the behavior idempotent even when `totalcap` only exists in the stored snapshot.

## Delivered Packages and Files

### New packages
- `internal/api/contracts`
- `internal/api/handlers`
- `internal/anime/service.go`
- `internal/sync/service.go`
- `internal/anime/domain/state_machine.go`

### Key new files
- `internal/api/contracts/contracts.go`
- `internal/api/handlers/anime_handler.go`
- `internal/api/handlers/sync_handler.go`
- `internal/anime/service.go`
- `internal/sync/service.go`
- `internal/anime/domain/state_machine.go`

## Traceability

- Proposal observation: `#1629` (`sdd/sdd-10-rest-api-write-sync/proposal`)
- Spec observation: `#1630` (`sdd/sdd-10-rest-api-write-sync/spec`)
- Design observation: `#1631` (`sdd/sdd-10-rest-api-write-sync/design`)
- Tasks observation: `#1633` (`sdd/sdd-10-rest-api-write-sync/tasks`)
- Verify report observation: `#1646` (`sdd/sdd-10-rest-api-write-sync/verify-report`)

## Links

- Promoted spec: `openspec/specs/rest-api-write-sync/spec.md`
- Archived change folder: `openspec/changes/archive/2026-04-08-sdd-10-rest-api-write-sync/`
- Key new files:
  - `internal/api/contracts/contracts.go`
  - `internal/api/handlers/anime_handler.go`
  - `internal/api/handlers/sync_handler.go`
  - `internal/anime/service.go`
  - `internal/sync/service.go`
  - `internal/anime/domain/state_machine.go`

## Archive Verification

- Main spec promoted to `openspec/specs/rest-api-write-sync/spec.md`
- Verify report verdict confirmed as `PASS`
- `tasks.md` confirmed fully complete (`14/14`)
- Change folder moved to `openspec/changes/archive/2026-04-08-sdd-10-rest-api-write-sync/`
- Active marker removed from `.atl/active-sdd-change`
