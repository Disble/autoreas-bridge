# Spec — Chapters Cover Pipeline (Go)

## ADDED Requirements

### Requirement: ChapterScheduleItem contract carries cover and literal path fields
`ChapterScheduleItem` SHALL expose a cover-availability gate plus the literal `carpeta`
(folder) and `pagina` (page) path/URL strings. The redundant `hasPage`/`hasFolder` booleans
are REPLACED by the literal strings (presence is re-derived in the frontend row helper as
`string !== ''`) — the DTO has exactly one consumer (the Chapters feature), so this is a
deliberate single-source-of-truth swap, not silent breakage. All OTHER fields present before
this change (`animeId`, `animeName`, `estado`, `nrocapvisto`, `totalcap`, `day`, `dayOrder`,
`modified_at`, `lastWatched`, `firstWatched`) SHALL keep their existing name, type, and
semantics.

> Amended by the orchestrator after the design phase: the original draft mandated keeping
> `hasPage`/`hasFolder` untouched; the approved design removes them because booleans + literal
> strings would be two sources of truth for the same fact. Design wins; recorded as an
> intentional contract change.

#### Scenario: Existing consumers see unchanged fields
- GIVEN a `ChapterScheduleItem` produced after this change
- WHEN an existing consumer (UI, test, or mapper) reads `animeId`, `animeName`, `estado`,
  `nrocapvisto`, `totalcap`, `day`, `dayOrder`, `modified_at`, `lastWatched`, or
  `firstWatched`
- THEN each field SHALL have the same name, type, and value semantics as before this change

#### Scenario: Literal folder and page strings are exposed
- GIVEN an anime with a non-empty `carpeta` and `pagina`
- WHEN `toChapterScheduleContracts` builds the DTO for that anime
- THEN the DTO SHALL carry the literal `carpeta` and `pagina` strings, and the old
  `hasFolder`/`hasPage` booleans SHALL no longer exist on the wire

#### Scenario: Absent folder or page yields empty literal strings
- GIVEN an anime with no folder or no page value
- WHEN the DTO is built
- THEN the corresponding literal string field SHALL be the empty string, and the frontend row
  helper SHALL derive "action hidden" from that emptiness (same visible gating as before)

### Requirement: Cover resolution follows a deterministic, placeholder-first order
A bound Go method SHALL resolve a portada value into either cover bytes (as a base64 data-URL)
or an explicit "use placeholder" signal, evaluated in this order:

1. Empty string or the literal `'null'` sentinel → no cover (placeholder).
2. A local disk path that exists → read and return the file's bytes.
3. A local disk path that does NOT exist → no cover (placeholder); MUST NOT crash or error out
   to the caller.
4. An http(s) URL with a cache hit → return the cached file's bytes WITHOUT any network call.
5. An http(s) URL with a cache miss and a successful download → persist the downloaded bytes to
   the local cache, then return them.
6. An http(s) URL with a cache miss and a failed download (e.g. offline) → no cover
   (placeholder); MUST NOT crash, MUST NOT write a corrupt or empty entry to the cache.

URL-vs-local-path detection SHALL be based on the string's shape only (scheme prefix), never on
the vestigial `portada.type` field.

#### Scenario: Empty portada resolves to placeholder
- GIVEN a portada value of `''`
- WHEN the cover-resolution method runs
- THEN it SHALL return the "no cover" signal, and the caller renders the placeholder

#### Scenario: Literal 'null' sentinel resolves to placeholder
- GIVEN a portada value of the literal string `'null'`
- WHEN the cover-resolution method runs
- THEN it SHALL return the "no cover" signal, identical to the empty-string case

#### Scenario: Existing local disk path is served
- GIVEN a portada value that is a local disk path pointing to a file that exists
- WHEN the cover-resolution method runs
- THEN it SHALL return that file's bytes as a base64 data-URL

#### Scenario: Missing local disk path resolves to placeholder without crashing
- GIVEN a portada value that is a local disk path pointing to a file that does NOT exist
- WHEN the cover-resolution method runs
- THEN it SHALL return the "no cover" signal
- AND it SHALL NOT panic, error out unhandled, or crash the binding call

#### Scenario: Cached URL is served without a network call
- GIVEN a portada value that is an http(s) URL already present in the local disk cache
- WHEN the cover-resolution method runs
- THEN it SHALL return the cached bytes as a base64 data-URL
- AND it SHALL NOT perform any network request

#### Scenario: Cache miss with successful download persists then serves
- GIVEN a portada value that is an http(s) URL not yet in the local disk cache, and the URL is
  reachable
- WHEN the cover-resolution method runs
- THEN it SHALL download the image, persist it to the local disk cache, and return it as a
  base64 data-URL

#### Scenario: Cache miss with failed download degrades to placeholder without poisoning the cache
- GIVEN a portada value that is an http(s) URL not yet in the local disk cache, and the download
  fails (e.g. the machine is offline)
- WHEN the cover-resolution method runs
- THEN it SHALL return the "no cover" signal
- AND it SHALL NOT crash
- AND it SHALL NOT write any cache entry for that URL (a later retry with connectivity restored
  MUST be able to attempt the download again)

### Requirement: Cached covers persist across restarts and survive loss of connectivity
Downloaded cover images SHALL be written to a persistent, OS-appropriate local cache directory
(not a temp directory subject to OS cleanup), keyed so a changed source URL never serves a stale
image.

#### Scenario: Cached cover survives an application restart
- GIVEN an anime whose cover was previously downloaded and cached
- WHEN the application is restarted and the same anime's cover is resolved again
- THEN the cover SHALL be served from the local disk cache without re-downloading

#### Scenario: Cached cover survives loss of network connectivity
- GIVEN an anime whose cover was previously downloaded and cached, and the machine is now
  offline
- WHEN the cover-resolution method runs for that anime
- THEN the cached cover SHALL still be served successfully

#### Scenario: A locally-sourced cover is never copied into the cache
- GIVEN an anime whose portada is a local disk path (not a URL)
- WHEN the cover-resolution method runs
- THEN the file SHALL be read live from its original location
- AND no copy of it SHALL be written to the cover cache directory

### Requirement: Per-day active-progress count mirrors Legacy's `buscarMedalla` semantics
A new aggregate query SHALL return, per day, the count of chapter-schedule entries that match
the day AND are active AND have `estado > 0` (any non-"Viendo" state: Finalizado, No me
gusto, or En pausa all count). "Active" uses the bridge's existing `Activo != 0` predicate —
the SAME population filter `ListChapterSchedule` applies to the visible list — so the badge
always counts entries the user can actually see.

> Amended by the orchestrator after apply Batch A: the original scenario demanded Legacy's
> tri-state "active-or-absent" rule, but `contracts.MobileAnime.Activo` already collapses
> absent→0 (`triStateToInt` in mobile.go) and the schedule list itself excludes those rows.
> Badge/list consistency wins over literal Legacy parity. Data audit (2026-07-05): 795/795
> records in `resources/autoreas-data/animes.dat` carry an explicit `activo` (780 false /
> 15 true) — no absent-flag record exists in real data, so the deviation is theoretical.
> If a future data audit surfaces absent-`activo` rows, thread `domain.Anime.ActivoState`
> through `ChapterQuery` in a dedicated change.

#### Scenario: Day with qualifying entries returns a nonzero count
- GIVEN two animes scheduled on "Lunes", one with `estado = 1` (Finalizado) and one with
  `estado = 0` (Viendo)
- WHEN the day-count aggregate runs for "Lunes"
- THEN the count for "Lunes" SHALL be 1 (only the `estado > 0` entry counts)

#### Scenario: Day with zero qualifying entries returns count 0
- GIVEN a day with only `estado = 0` entries (or no entries at all)
- WHEN the day-count aggregate runs for that day
- THEN the count SHALL be 0

#### Scenario: Inactive entries are excluded, matching the visible schedule list
- GIVEN one anime with `estado > 0` and `Activo != 0`, and another anime with `estado > 0`
  and `Activo == 0` (explicitly inactive, or absent in Legacy data and collapsed to 0 by
  `triStateToInt`)
- WHEN the day-count aggregate runs
- THEN only the `Activo != 0` anime SHALL be counted — the badge population is identical to
  the population `ListChapterSchedule` returns for that day
