# Proposal: Syncing anime dashboard panel (sdd-25)

**Change**: `2026-06-20-sdd-25-syncing-anime-panel`
**Project**: autoreas-bridge
**Status**: proposed
**Builds on**: `2026-06-20-sdd-24-network-ui-redesign` only as adjacent UI work; no dependency on the Network/Observability redesign internals

---

## 1. Why / Intent

The dashboard currently exposes bridge health, pairing, and logs, but it does not
answer the operational question that matters during sync: **which anime records
are still in flight right now**.

The bridge already persists pending changelog rows in SQLite. That queue is the
most truthful source for "se estan sincronizando" in the current runtime,
because it represents bridge-side work that has not yet been reconciled away.
Using raw logs would create a misleading activity feed; using all historical
changes would overstate active sync work.

This change adds a product-facing dashboard section that turns the pending queue
into recognizable anime items with title and progress metadata.

## 2. Scope

**In scope**
- New dashboard panel under `frontend/src/features/dashboard/ui/` showing the
  current syncing anime list.
- Small backend/Wails adapter to expose a truthful runtime list of pending anime
  sync items.
- Queue compaction by `anime_id`: one visible card/row per anime, based on its
  latest pending changelog entry plus a pending-count badge.
- Empty state when no anime is currently pending.

**Out of scope**
- Generic log mirroring.
- Historical sync timeline.
- Live push updates for the pending queue. Initial load plus refresh on dashboard
  reconcile action is sufficient for this ship slice.

## 3. Data-source decision

Chosen source: **SQLite changelog rows where `status = pending`**, compacted by
`anime_id` to the latest row per anime.

Tradeoff:
- This source is truthful about bridge work still pending.
- It can show multiple pending mutations as a count badge without duplicating UI
  rows.
- It does not claim transport-level progress percentages that the runtime does
  not currently track.

Rejected source: raw observability/network logs.
Reason: logs prove activity, not current pending sync state.

## 4. Affected modules

- `internal/api/contracts/contracts.go`
- `internal/sync/changelog_store.go`
- `internal/sync/service.go`
- `app.go`
- `frontend/src/infrastructure/bridge-runtime-source.ts`
- `frontend/src/shared/contracts/syncing-anime.types.ts`
- `frontend/src/features/dashboard/ui/BridgeDashboard/**`
- `frontend/src/features/dashboard/ui/SyncingAnimePanel/**`
- `frontend/wailsjs/go/main/App.d.ts`
- `frontend/wailsjs/go/main/App.js`

## 5. Rollback plan

Revert this change's commit. The backend addition is additive and the dashboard
composition can be removed without schema rollback.

## 6. Risks

- Pending queue rows can include multiple entries for the same anime; the UI must
  compact them or it will overcount visible work.
- Some pending rows may not carry a rich snapshot. The adapter must degrade to
  `anime_id` without inventing fields.
- Wails bindings are additive and must stay aligned with the new Go method.
