# Proposal: Network UI redesign — faithful to Observability (sdd-24)

**Change**: `2026-06-20-sdd-24-network-ui-redesign`
**Project**: autoreas-bridge
**Status**: proposed
**Builds on**: `2026-06-20-sdd-23-network-tab-ui` (the feature + foundation already exist; this is a UI/UX correction)

---

## 1. Why / Intent

The shipped Network table (sdd-23) is unreadable: it modeled EVERY bridge log
entry as if it were an HTTP request (method/path/status), so non-HTTP domain
events (`anime.changed`, `bus.publish`, `sync.received`) render as `Status:
pending` with `Name = domain`, and the single most informative fields — the
log **message** and **level** — are discarded.

The Network tab **is the Observability screen redesigned**: same data (everything
that flows through the bridge), presented as a DevTools-Network table + detail
inspector instead of a log feed. This change makes it faithful to that data.

## 2. Scope

**In scope**
- Row model = ONE log entry per row (NOT folded by correlationId). Source is the store's raw entry buffer.
- Table columns: **TIME · DOMAIN · LEVEL · MESSAGE · STATUS · DURATION** (MESSAGE = the log message; for `http.request` show `METHOD path`; STATUS = metadata.status when present, else `—`).
- DOMAIN + LEVEL colored tags reusing the same palette as `ObservabilityPanel`.
- Detail inspector: header (message + domain + level) → field list (timestamp, domain, eventType, level, correlationId, entityId, durationMs) → **metadata** key-value table → **trace** (other entries sharing the same correlationId, time-ordered).
- Filters: free-text over message/domain/eventType/path + a **level** filter (all/info/debug/warn/error) replacing the HTTP-status filter.

**Out of scope**
- KPI strip (not a bridge need; Observability has none).
- Backend changes. The multi-phase waterfall (still deferred).
- Removing the existing ObservabilityPanel/route (kept; this is additive to the Network feature).

## 3. Approach

Keep the hexagonal foundation untouched (port + store). Expose the raw entry
buffer for a per-entry view; build per-entry view-models in pure, JSDoc'd,
test-first helpers. Redesign the dumb `NetworkTable`/`NetworkDetail`/
`NetworkFilterBar` for density and readability. Reuse Observability's
domain/level color helpers.

## 4. Affected modules

- `frontend/src/features/network/**` (helpers, types, constants, hook, table, detail, filter bar + tests).
- Possibly `frontend/src/shared/store/network-store*` (per-entry selection + raw buffer selector) — additive, test-first.

## 5. Rollback plan

Frontend-only. Revert this change's commit to return to the sdd-23 table. The
store/port foundation is unaffected either way.

## 6. Risks

- Selection key changes from folded-correlationId to per-entry id — update the store selector + tests.
- Must reuse real domain/level palette so it visually matches the rest of the app.
