# SDD-56 — BREAKING CHANGE: API Impact for the Mobile Team

**Change:** Bridge SQLite is now the sole canonical source of truth (SDD-55), and its entire
wire vocabulary — storage, every REST response, every WebSocket payload, and the PATCH
request body — is now **English-only** (SDD-56 hard cutover).
**Date announced:** 2026-07-22
**Audience:** `autoreas-mobile` maintainers
**Source of truth:** `docs/openapi.yaml` (this document summarizes the consumer impact).
**Supersedes:** `docs/sdd-55-mobile-impact.md`'s original additive-alias notice (2026-07-21,
still preserved in git history). That notice described the PATCH English keys as optional
aliases living alongside the Spanish ones. **That is no longer true.** This document
replaces it entirely.

---

## TL;DR

- **This is a breaking change, not an opt-in migration.** Every Spanish field name that
  used to appear in a GET response or a WebSocket payload is GONE. Any Mobile code still
  deserializing `_id`, `estado`, `nrocapvisto`, `dias`, `nombre`, etc. from a bridge response
  will silently fail to populate those fields (they simply will not be present in the JSON
  anymore).
- **The PATCH write path no longer accepts the Spanish keys.** Sending a deprecated Spanish
  key (`estado`, `nrocapvisto`, `dias`, `fechaUltCapVisto`) WITHOUT its English replacement
  now returns `400 Bad Request`. Sending both is fine — the English value wins and the
  Spanish one is ignored.
- **The `$$date` extended-JSON date wrapper is gone.** Every date-like field (`lastWatchedAt`,
  `premieredAt`, `createdAt`, `deletedAt`, `rated_at`, …) is now a plain epoch-milliseconds
  integer, or `null`. Sending `{"lastWatchedAt": {"$$date": ...}}` on PATCH is now rejected.
- **`kind` and `sourceUrl` are unified single fields.** The legacy dual/overlapping
  Spanish concepts (`tipo`/`pagina` and related duplicated fields) collapse into one
  `kind` (integer, nullable) and one `sourceUrl` (string, nullable) field respectively.
- **Deploy is lockstep-gated.** Bridge's release carrying this cutover MUST NOT ship to
  users running an `autoreas-mobile` build that still expects the Spanish vocabulary. See
  "Lockstep deploy guidance" below.

---

## 1. Full field name map

Every field below was renamed from its Legacy-Spanish name to the listed English name.
Any field not listed did not change.

### Anime (GET /api/animes, GET /api/animes/{id}, WebSocket `snapshot`)

| Spanish (gone) | English (now) | Notes |
|---|---|---|
| `_id` | `id` | |
| `nombre` | `name` | |
| `estado` | `status` | integer `0..3`, same validation |
| `nrocapvisto` | `episodesWatched` | number `>= 0`, fractional allowed |
| `totalcap` | `totalEpisodes` | nullable integer |
| `activo` | `active` | integer `0..1` |
| `primeravez` | `firstCycle` | integer `0..1` |
| `dias` | `days` | array of `AnimeDay` |
| `dias[].dia` | `days[].day` | e.g. `"Monday"` |
| `dias[].orden` | `days[].order` | integer |
| `generos` | `genres` | array of strings |
| `tipo` | `kind` | nullable integer; unified with the legacy dual concept |
| `fechaUltCapVisto` | `lastWatchedAt` | epoch-ms integer or `null` |
| `fechaEstreno` | `premieredAt` | epoch-ms integer or `null` |
| `fechaCreacion` | `createdAt` | epoch-ms integer or `null` |
| `fechaEliminacion` | `deletedAt` | epoch-ms integer or `null` |
| `portada` | `cover` | nullable string |
| `pagina` | `sourceUrl` | nullable string; unified single source-URL field |
| `carpeta` | `folder` | nullable string |
| `estudios` | `studios` | nullable string |
| `origen` | `origin` | nullable string |
| `duracion` | `durationMinutes` | nullable integer |
| `numrepeticion` (repetition entries) | `numRepetitions` | integer |
| `repetir` (repetition-history array) | `repetitions` | array of repetition entries, `omitempty` |
| `modified_at` | `modified_at` | UNCHANGED — bridge-private OCC token (SDD-30), keep echoing as `base` |

### Repetition history entries (`repetitions[]`)

| Spanish (gone) | English (now) |
|---|---|
| `numrepeticion` | `numRepetitions` |
| `nrocapvisto` | `episodesWatched` |
| `estado` | `status` |
| `fechaCreacion` | `createdAt` |
| `fechaEstreno` | `premieredAt` |
| `fechaUltCapVisto` | `lastWatchedAt` |
| `fechaEliminacion` | `deletedAt` |
| — | `repeatedAt` (new, nullable) |

### Season rating (`POST /api/seasons/active/ratings`)

Already English-only before this change (`anime_id`, `grade`, `rated_at`) — no action needed.

---

## 2. Date field flattening: no more `$$date`

Before this change, some date-like fields could appear wrapped in an extended-JSON
envelope (`{"$$date": 1719160000123}`). That wrapper is now gone everywhere — storage,
every response, and PATCH. Every date field is a plain epoch-milliseconds integer, or
`null` when absent:

```json
{ "lastWatchedAt": 1719160000123 }
```

not

```json
{ "lastWatchedAt": { "$$date": 1719160000123 } }
```

Sending the `$$date` form on `PATCH /api/animes/{id}` is now a `400 Bad Request` (it was
already rejected before this change; this is confirmation the behavior did not regress).

---

## 3. PATCH write path: English-only, fail-loud on stale Spanish keys

`PATCH /api/animes/{id}` no longer accepts the SDD-55 additive Spanish/English dual-key
behavior. The rule is:

- Send the **English** key (`status`, `episodesWatched`, `days`, `lastWatchedAt`). Validation
  ranges are unchanged from before.
- If you send the **deprecated Spanish** key (`estado`, `nrocapvisto`, `dias`,
  `fechaUltCapVisto`) **without** its English replacement present in the same body → the
  request fails with `400 Bad Request` and an explicit message, e.g.:

  ```json
  { "error": "field \"estado\" was renamed to \"status\"" }
  ```

- If you send **both** the English key and the stale Spanish key for the same concept, the
  request still succeeds (`200`): the English value is applied, the Spanish value is
  silently ignored. This is a migration convenience, not a long-term supported pattern —
  drop the Spanish key once you've cut over.
- A truly unknown key (neither English nor a deprecated Spanish key) is silently ignored, as
  before.
- `base` (SDD-30 OCC token) is unchanged — continue sending the last-known `modified_at`.

### Example — required English form

```http
PATCH /api/animes/abc123
Content-Type: application/json

{
  "status": 1,
  "episodesWatched": 31,
  "days": ["Monday", "Thursday"],
  "lastWatchedAt": 1721580000000,
  "base": 1721580000000
}
```

### Example — now REJECTED (Spanish-only)

```http
PATCH /api/animes/abc123
Content-Type: application/json

{ "estado": 1 }
```

```
400 Bad Request
{ "error": "field \"estado\" was renamed to \"status\"" }
```

### Business rule (unchanged)

If `episodesWatched >= totalEpisodes` and `totalEpisodes > 0`, Bridge forces `status` to
`1` (completed) server-side.

---

## 4. Lockstep deploy guidance

This is a hard cutover with no dual-serving period on the response/read side (GET and
WebSocket payloads are English-only the instant this Bridge build ships — there is no
"both names present" compatibility mode for reads, unlike the PATCH write path's
temporary dual-key tolerance described in §3).

- **Do not** roll out a Bridge release containing this change to any user population still
  running an `autoreas-mobile` build that expects the Spanish response vocabulary. Doing so
  will silently break every field read on that mobile build (fields will simply be absent
  from the JSON it expects, not present-but-differently-named — deserializers using
  lenient/optional field mapping will produce empty/null values rather than throwing).
- **Recommended sequence:**
  1. Ship an `autoreas-mobile` build that deserializes the English vocabulary from §1
     (can be done ahead of time against a Bridge build carrying this change in a
     pre-release/staging channel).
  2. Confirm the mobile build is adopted by the target user population (auto-update
     completed, or the release channel gates on it).
  3. Only then roll out the Bridge release carrying this cutover to that population.
  4. On the write side only, the PATCH dual-key tolerance (§3) gives a short grace window
     if a stray old-mobile-build PATCH slips through, but this is safety margin, not a
     substitute for lockstep sequencing on the read side.
- If Bridge and mobile cannot be sequenced (e.g., independently auto-updating desktop vs.
  mobile app stores), coordinate directly with the Bridge maintainers before shipping —
  this is the scenario the lockstep requirement exists to catch.

---

## 5. Migration checklist for Mobile (required, not optional)

- [ ] Update all response deserialization to the English field names in §1 (Anime,
      repetition-history entries).
- [ ] Update any code decoding a wrapped `$$date` object — it no longer appears; expect a
      plain integer or `null` (§2).
- [ ] Switch all PATCH payload keys to `status` / `episodesWatched` / `days` /
      `lastWatchedAt` (§3). Stop sending the Spanish keys once migrated.
- [ ] Confirm `kind` and `sourceUrl` are read as single unified fields, not the prior
      Spanish dual concepts.
- [ ] Coordinate the Bridge release rollout with mobile's release schedule per §4 —
      do not let a Spanish-vocabulary-expecting mobile build receive a Bridge build
      carrying this change.

---

*Questions or concerns about sequencing this rollout → open an issue against
`autoreas-bridge` referencing SDD-56, or ping the Bridge maintainers before either side
ships.*
