# Proposal — sdd-50-sync-conflict-resolution

> **Status: PARKED.** Blocked on `2026-07-14-sdd-49` (two-way Bridge↔Legacy
> stabilization + canonical anime state). Do NOT implement until SDD-49 lands.
> SDD-49 only has to leave the seams this change needs, not build any of it.

Give the user a modern, humane way to resolve sync conflicts on animes — the
kind that become unavoidable **because** Bridge now writes back to Legacy's
`animes.dat` while a phone (and Legacy itself) can edit the same record. No
line-diff editor. Built for a normal person, not a merge-tool operator.

## Why this is a separate, later change

Conflicts only matter once the two-way write is **stable and canonical**
(SDD-49). Resolving conflicts on top of records Bridge might itself be
corrupting would be building on sand. So: stabilize first (SDD-49), resolve
second (here).

## What already exists (SDD-30)

SDD-30 shipped most of the conflict **engine**:

- **Detection (mobile axis only):** `WriteService.PatchAnime`
  (`internal/anime/service.go`) uses an OCC token — `AnimePatch.Base` = the
  `modified_at` the client last read. On divergence it is **non-blocking**: it
  does not clobber, it records a pending conflict and fires a `warning`
  notification (`reportConflict`, ~L503-534). `OCCObserveOnly` = last-call-wins
  rollout mode.
- **Storage:** `conflicts` table + `ConflictStore`
  (`internal/sync/conflict_store.go`): `InsertConflict` / `ListConflicts`
  (pending only) / `ResolveConflict`.
- **API:** `GET /api/conflicts`, `POST /api/conflicts/{id}/resolve`
  (`internal/api/router.go`), wired into the HTTP server.
- **Frontend infra to mirror:** notification/toast system
  (`frontend/src/app/AppLayout` → `NotificationToasts`,
  `infrastructure/notification-source`, `hooks/use-notification-toasts`).

## The three real gaps this change closes

1. **Resolution is a dismiss, not a decision.** `ResolveConflict` only sets
   `status='resolved'` — it never applies the chosen winner back through the
   write path, so "resolving" silently discards one edit (SDD-30 explicitly
   deferred this — see the `ConflictRecord` comment in `contracts.go`).
2. **No Legacy-axis detection.** Reconcile ingest `DiffSnapshots`
   (`internal/anime/snapshot.go`) is **silent last-writer-wins**: a Legacy change
   to `animes.dat` is accepted as truth, the token bumps, no conflict is
   recorded. A phone edit overwritten by a later Legacy edit vanishes with no
   trace. This is the axis the user cares about most.
3. **No UI at all.** The frontend has zero conflict surface today.

## Approach

### Detection — field-level 3-way merge (the hard part; needs a design spike)

Legacy and Bridge/phone almost always edit **different** fields. Forcing a
conflict on those is wrong. So keep a **merge base** (the last value Legacy and
Bridge agreed on) and, when Legacy changes `animes.dat`, diff `base→Legacy` and
`base→Bridge` per field:

- Only one side touched a field → **auto-merge silently.** No conflict, no modal.
- Both sides changed the **same** field to **different** values → **true
  collision** → record a conflict and surface it.

User-facing framing: *"The app quietly combines changes that don't clash; you
only ever see a conflict when two things changed the same value."* This keeps the
modal **rare and meaningful**.

> ⚠️ **Risk / open design:** `animes.dat` is a NeDB append-log carrying no Bridge
> version token, so reliable base-tracking on the reconcile path is non-trivial.
> Seams to build on: the monotonic `modified_at` (SDD-30 ADR-30-1), the
> `SelfEchoRegistry` (own-write suppression), the changelog store. **This needs a
> dedicated `/sdd-explore` spike before committing an estimate.**

### Resolution — apply for real, and reversible

Choosing a winner must **replay that value through the OCC write path** (append
to `animes.dat`, re-stamp the token, propagate to the phone) — not flip a status
flag. Both snapshots are already stored, so the losing side gets a short **undo**
window for free.

### UI — the generalist resolution surface (design agreed with the user)

- **Auto-launches on detection.** When a true collision is found, the surface
  **opens itself** — non-blocking; the user can defer it to the inbox and keep
  working.
- **Global overlay in the app shell**, sibling to `NotificationToasts`, driven by
  a small zustand store (`useConflictInbox` → `count`, `open(id)`) so **any
  section can trigger it** — callable from anywhere, like a notification but a
  modal. On mobile width it is a full-screen sheet, not a centered modal.
- **Two human cards** — *"This device"* vs *"Your phone"* / *"Legacy"* — showing
  **only the fields that clash**, in plain language (e.g. *"Episodes watched: 5"*
  vs *"…: 7"*). **No diff.**
- **Per-field pick.** For each clashing field, choose the side. Because 3-way
  merge means usually only one field collides, this stays simple.
- **No "recommended" / no pre-selected winner.** The app does not guess — the
  user decides. (Explicit user preference.)
- **Inbox** for deferred conflicts: a list to work through. **No "resolve all as
  recommended"** bulk magic.
- **English-first** (`Keep`, `Undo`, `Review`…), HeroUI v3 (`autoreas-theme`),
  WebView2-safe, keyboard-navigable. Spanish only at the Legacy `animes.dat`
  adapter boundary.

## Scope

**In:** anime conflicts, all fields; 3-way field-level merge detection on both
axes (mobile↔Bridge already partially built, Legacy↔Bridge new); real resolution
through the write path + undo; the resolution UI + inbox.

**Out:** multi-entity generalization (this is anime-only — "any type" meant any
*field*, not any entity type); any line/text diff editor; auto-resolution
heuristics or a "recommended" winner; changing SDD-49's canonical-state work.

## Dependencies

- **SDD-49** must land first: canonical anime state, stable two-way write, and
  the prepared seams (version token + merge base + conflict store).

## Risks / open questions

- **Legacy-side detection** is the genuine unknown (append-log, no version
  token). Design spike required before estimating.
- **Merge base provenance:** where the "last agreed" base per anime is stored and
  how it survives reconcile needs design.
- **Undo window** semantics (duration, storage, propagation to mobile).
