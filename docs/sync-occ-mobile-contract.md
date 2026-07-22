# Sync OCC Contract for Autoreas Mobile (SDD-30)

> Audience: the **Autoreas Mobile** team. This describes the bridge-side
> optimistic-concurrency (OCC) sync contract introduced by SDD-30. The bridge
> work is done; the items below are what **mobile** must implement to get full
> conflict protection. Until mobile adopts them, the bridge runs in a safe
> backward-compatible mode (see "Rollout").

## Why

When the same anime is edited on desktop and on mobile between two syncs, the
old behavior silently overwrote one side (last-write-wins). SDD-30 detects that
divergence, preserves BOTH versions, and surfaces a conflict — but it can only
detect it if mobile tells the bridge **what version it was editing from**.

## 1. Read and store `modified_at`

Every anime the bridge returns now carries a new field:

```json
{ "id": "anime-123", "name": "...", "modified_at": 1719160000123, ... }
```

> SDD-56 note: every response field is English-only (`name`, `status`,
> `episodesWatched`, `days`, `lastWatchedAt`, etc.) — see
> `docs/sdd-55-mobile-impact.md` for the full name map.

- `modified_at` (int64) is the bridge-owned **version token** for that anime. It
  is strictly monotonic per anime (it only ever increases; do not interpret it as
  a wall-clock time even though it is millisecond-based).
- Mobile MUST persist `modified_at` alongside each anime it caches.

## 2. Echo `base` on every write

When mobile sends a `PATCH /api/animes/:id` (or a `pending_operation` inside
`POST /api/sync/reconcile`), it MUST include the `modified_at` it last saw for
that anime as `base`:

```json
PATCH /api/animes/anime-123
{ "base": 1719160000123, "episodesWatched": 12, "status": 1 }
```

> SDD-56 note: the deprecated Spanish patch keys (`estado`, `nrocapvisto`,
> `dias`, `fechaUltCapVisto`) are now REJECTED with `400 Bad Request` when
> sent without their English replacement.

Bridge behavior given `base`:

| Case | Bridge action |
|------|---------------|
| `base == current modified_at` | Fast-forward: applies the write, stamps a new token. (A decrease is allowed — it's a deliberate correction.) |
| incoming value already equals current | No-op success (idempotent). |
| `base != current` (desktop changed it since you read) | **Conflict**: bridge keeps BOTH versions, does NOT overwrite, notifies the user. The write still returns success (you are never blocked). |
| `base` omitted, record is new | Treated as a create. |
| `base` omitted, record exists | Safe path — treated like a divergence (never silently overwrites). **This is the old-client fallback — avoid it by always sending `base`.** |

The HTTP response is always success (non-blocking). Mobile is never hard-blocked
and never needs a retry loop.

## 3. After a write, refresh `modified_at`

Because the bridge stamps a new token on every applied write, mobile MUST refresh
its cached `modified_at` for that anime from the next sync/response. Reusing a
stale token as the next `base` will (correctly) be treated as a divergence.

## 4. Conflict resolution UX (mobile-owned)

The bridge only **records and exposes** conflicts; the resolution UX lives in
mobile. Endpoints:

- `GET /api/conflicts` → pending conflicts. Each item now exposes both divergent
  snapshots (`local_snapshot_json` = bridge's current, `remote_snapshot_json` =
  what mobile tried to write).
- `POST /api/conflicts/:id/resolve` → mark a conflict resolved.

Mobile should present both versions to the user, let them pick/merge, write the
chosen result back with the **current** `base`, then resolve the conflict. This
is the git/Syncthing model: some conflicts genuinely need a human.

## Rollout (staged)

The bridge has a server-side lever, `OCCObserveOnly`:

- **`true` (current default, set in `app.go`)** — divergences are LOGGED ONLY and
  applied last-write-wins; NO conflict rows, NO notifications. This keeps current
  mobile clients (that don't send `base` yet) fully working while the bridge
  gathers conflict telemetry from the logs.
- **`false` (full enforcement)** — divergences become real conflicts + user
  notifications and are NOT auto-applied.

**Recommended sequence:** ship mobile's `base` echo (sections 1–3) and the
conflict UX (section 4) → confirm via logs that real conflicts are rare and
correctly detected → flip `OCCObserveOnly` to `false` to enable full enforcement.
Flipping the lever is a one-line change at the bridge composition root today (a
future enhancement could make it an env/config toggle if operators need it).

## Out of scope (not built)

- The conflict-resolution UI (mobile-owned — section 4 is the contract for it).
- Operation/delta-based sync, idempotency keys, device-ownership rules — the
  bridge is state-based with absolute values + this OCC token.
