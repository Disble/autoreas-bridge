# SDD-44x — Mobile handoff: season rating sync (draft for the mobile team)

> Companion to SDD-44. Everything the mobile sister repo needs to read,
> understand, and adapt to its own reality. Bridge-side contract is fixed by
> SDD-44; mobile decides its own UX and internals.

## 1. Context — what the feature is

Bridge is gaining the full new-season anime selection workflow. During the
first ~2 weeks of each season the user watches chapter 1 of ~20+ candidate
animes and grades each **1–6**. Watching happens on MOBILE (~98% of the
time), so the grade should be captured on mobile right after watching and
synced to bridge, which runs the rest of the workflow (selection with a
minimum approval grade, ordering, day assignment). Bridge keeps a manual fallback editor, so mobile
being offline or the feature lagging NEVER blocks the season — but the
first-class path is mobile.

What mobile does today that stays unchanged: anime progress updates flow
through `PATCH /api/animes/{id}` (the `AnimePatch` shape) and the WS reconcile
envelope. The season grade is NOT an anime field — it belongs to bridge's new
per-season evaluation registry — hence the new dedicated endpoint below.

## 2. When mobile should offer grading

- Bridge already broadcasts `preferences_changed {season_mode: bool}` over WS
  (in production since season-mode-mobile-sync). Season mode ON = evaluation
  window is plausible.
- SDD-41 adds a `season_changed` broadcast; on it (or on demand) mobile can
  ask bridge for the active season snapshot to know WHICH animes are season
  candidates (endpoint shape final in SDD-41's apply; the DTO will include
  `anime_id`, `nota_estreno`, `nota_source` per row).
- Simplest viable mobile UX (mobile's call): when season mode is ON and the
  user finishes/leaves an anime that is a season candidate, show the 1–6
  grade prompt; queue the POST if offline.

## 3. The contract (bridge side — fixed)

### REST (primary path)

```
POST /api/seasons/active/ratings
Authorization: Bearer <device token — same token mobile already uses>
Content-Type: application/json

{ "anime_id": "<legacy anime _id>", "nota": 4, "rated_at": 1751500000000 }
```

| Response | Meaning | Mobile behavior |
|---|---|---|
| `204` | recorded | done; clear from queue |
| `409` | a MANUAL grade already exists in bridge (body: `{"nota": n, "source": "manual"}`) | drop silently or surface "already graded on desktop: n"; do NOT retry |
| `404` | no active season, or anime not in the active season | treat as "not a season anime"; do NOT retry |
| `422` | nota outside 1–6 / malformed body | bug — fix payload |
| `401` | bad/expired token | existing re-pair flow |

Idempotency: same `anime_id` re-POSTed with the same nota → `204` (no-op).
Different nota from mobile when a mobile grade exists → `204`, overwrites
(mobile correcting itself is fine); only MANUAL grades are protected (409).

### WebSocket (optional optimization, same payload)

Incoming message on the existing socket:

```json
{ "type": "season_rating", "anime_id": "...", "nota": 4, "rated_at": 1751500000000 }
```

No per-message ack; confirmation arrives as the `season_changed` broadcast.
If mobile wants delivery certainty, use REST — WS is fire-and-forget sugar.

### Broadcast (bridge → all devices)

`season_changed` — emitted after any season mutation (rating ingested, phase
advanced). Mobile may use it to refresh its season snapshot or ignore it.

## 4. Conflict semantics (bridge-enforced — mobile needs no logic)

- Empty cell + mobile grade → recorded, `source=mobile_sync`.
- Manual grade present + mobile grade → manual KEPT, mobile gets `409`,
  desktop user sees a warning toast.
- Manual edit on desktop after a mobile grade → manual wins, source flips.

Mobile's only responsibility: honest `rated_at`, no retry on 404/409.

## 5. Edge cases mobile should expect

- **Season anime not yet in mobile's local DB**: created animes sync through
  the normal changelog (`anime_created` broadcast + `GET /api/animes/changes`)
  — the anime arrives like any other; no special casing.
- **Season closes while a rating is queued**: `404` (no active season) —
  drop; bridge's manual fallback covers stragglers.
- **User re-watches and re-grades on mobile**: allowed (mobile overwrites
  mobile); send the new nota.
- **Two-cour continuations**: never season candidates; grading UI shouldn't
  offer them (they won't be in the season snapshot).

## 6. Acceptance checklist for the mobile implementation

- [ ] Grade prompt reachable for season-candidate animes while season mode ON.
- [ ] POST with queued-offline retry (except 404/409 — terminal).
- [ ] `409` surfaced or dropped, never retried.
- [ ] Timestamps are the watch/grade moment, not the sync moment.
- [ ] No grading UI when season mode OFF or anime not a candidate.
- [ ] (Optional) WS `season_rating` path behind the same queue.

## 7. Open items — answered by the bridge owner (2026-07-05)

1. **Covers**: mobile does NOT use covers in its UI (offline-first
   constraint) — the season snapshot endpoint will NOT include cover URLs.
2. **Offline queue**: reuse/extend the existing pending-operations pattern
   with a proper design pattern for queued outbound operations (bridge
   accepts both REST and the WS envelope; pick whatever fits mobile's
   existing queue architecture — the contract is transport-agnostic).
3. **"Graded" indicator back to mobile**: mobile team's call —
   `season_changed` + snapshot re-fetch is available; anything richer is a
   mobile-side decision.

UI note from the bridge side: bridge captures manual grades via a rate
button on the anime card opening a 1–6 modal — mobile is encouraged to
mirror the same gesture on its own cards for cross-app muscle memory.
