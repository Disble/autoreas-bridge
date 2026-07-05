# Proposal: SDD-38 Chapters/Covers Parity with Legacy

> Change: `sdd-38-chapters-covers-parity` · Project: `autoreas-bridge` · Artifact store: hybrid
> Depends on exploration `sdd/sdd-38-chapters-covers-parity/explore` (engram #4636 / `explore.md`).

## Why

The bridge's Chapters (day-schedule) page works, but the Legacy app still wins on the
one interaction that matters most: **updating today's chapter progress, fast, with the
anime instantly recognizable and the destructive/constructive actions unmistakable.**

Concretely, Legacy does three things the bridge does not:

1. **Recognizability** — every card carries a cover image that flows into the card edge,
   so you identify the anime at a glance instead of reading a title. The bridge shows no
   cover at all on this page.
2. **Instant progress feedback** — hovering the watched-count swaps it to a
   "N remaining" readout, so you know how far today's session gets you without opening
   anything. The bridge hides this behind a tooltip.
3. **Unmistakable action hierarchy** — Legacy's minus is red, plus is blue; the primary
   ± actions dominate the card visually. The bridge renders minus as neutral gray, so the
   destructive action reads the same as any other control.

Two smaller parity gaps compound the above: folder/page tooltips show a generic
aria-label instead of the real path/URL, and the day tabs carry no count badge telling
you how many entries on that day are already resolved (`estado > 0`).

The mission is not to clone Legacy — it is to **surpass the original with 2026 standards
without losing its simplicity.** That means: adopt what Legacy got right (cover flow,
color-coded actions, remaining-on-hover), fix what it got wrong (the half-chapter
truncation bug in the hover swap), and reject vestigial complexity (the unused
`portada.type` field, the decoy stats page).

**Cover pipeline hard requirement (verbatim user intent):** the vast majority of animes
have no cover, so the **placeholder is the default case**. Covers may come from a local
disk path OR an online URL, and **online images MUST be downloaded and cached locally
before display so they survive loss of internet.** The user said "temp directory"; we
interpret that intent as a *persistent* cache (see Resolved Decision 2) because an OS temp
directory can be swept by the OS, which would defeat the stated goal of not losing images
offline.

## What Changes

1. **Cover + literal path fields on `ChapterScheduleItem`, end-to-end.** Add a resolved
   cover field plus the literal `carpeta` (folder) and `pagina` (page) path/URL strings to
   the DTO, from the Go struct in `contracts.go` through `toChapterScheduleContracts` in
   `app_runtime.go`, the TS type, the row helper, and into the UI. Today the item exposes
   only `hasFolder`/`hasPage` booleans, which is why real-path tooltips are impossible.

2. **Go cover-resolution binding with a local disk cache.** A new bound Go method resolves
   a portada into something the webview can render, mirroring Legacy's resolution order but
   ignoring the vestigial `type` field (detect URL-vs-path from the string shape):
   - empty / `'null'` sentinel → signal "use placeholder" (no image returned);
   - local disk path → read the file from disk and return it;
   - URL → return the cached copy; on cache miss, download-then-cache, then return it; if
     the download fails and no cache exists → signal placeholder.
   Transport is a **base64 data-URL** returned in the DTO (Resolved Decision 1). Cover
   fetch/cache logic lives in a **new Go package/file**, not in `chapter_service.go`
   (file-size policy: prefer new files).

3. **Hover-swap watched↔remaining in the dumb component.** The "remaining" math already
   exists in `chapter-schedule-panel.helpers.ts`; convert its presentation from a tooltip
   to an on-hover text swap (watched count ↔ "N remaining"). **Do NOT reproduce Legacy's
   truncation bug** — Legacy's mouseover path runs `parseInt(cap)` (truncating half-chapter
   progress) while mouseout does not, so the two directions disagree. Both directions must
   use the same non-truncated value.

4. **Danger-colored minus / primary-action visual hierarchy.** The minus button moves from
   neutral `tertiary` to the `danger` semantic color; plus stays the constructive/primary
   action. The ± pair becomes the visually dominant control on the card, matching Legacy's
   intent (red/blue dominance) with HeroUI semantic tokens rather than raw colors.

5. **Per-day `estado > 0` count badges on the day tabs.** A **new Go aggregate query**
   (e.g. `GetChapterDayCounts`) returns per-day counts of active entries with
   `estado > 0`, mirroring Legacy's `buscarMedalla` semantics (day match AND active-or-absent
   AND `estado > 0`). The counts wire into the day `ToggleButton`s as badges; count 0 shows
   no badge.

6. **Shared cover placeholder.** The placeholder illustration currently lives as
   `AnimeCoverPlaceholder.tsx`, feature-scoped to anime-detail. Promote it to a shared
   location so both Anime Detail and Chapters consume one placeholder (Resolved Decision 3).

7. **(Optional micro-polish) Status-dialog trigger placement parity.** Legacy's status
   dialog is opened by an always-visible sun icon inline with the folder/page icons on the
   left; the bridge already has the equivalent 4-option dialog but triggers it from a
   right-side menu-dots button. Moving the trigger inline for discoverability is a UX polish,
   not a data change — carry it only if it fits the batch without risk.

All new/changed UI copy is **English** (project convention; Legacy's Spanish strings are
data-side only).

## Impact

**Go / backend**
- `internal/anime/contracts.go` — add cover + `carpeta`/`pagina` fields to
  `ChapterScheduleItem`; add day-count DTO.
- `internal/anime/chapter_service.go` — populate the new fields; **new day-count query
  added in a new file**, not by growing this one.
- `app_runtime.go` — `toChapterScheduleContracts` maps the new fields; expose the new
  bindings.
- `main.go` / bindings — register the cover-resolution binding and the day-count binding.
- **New Go package/file** — cover download + local disk cache + base64 encoding.

**Frontend**
- `frontend/src/features/chapters/ui/ChapterSchedulePanel/` — types, row helper, hook, and
  dumb component updates for cover render, hover-swap, danger minus, day badges, real-path
  tooltips. Watch the 400-line warning threshold (files are comfortably under today).
- Promote `AnimeCoverPlaceholder.tsx` to a shared location; update the anime-detail import.
- Reuse the `normalizeAnimeDetailPortadaUrl` empty/`'null'` normalization (or a shared
  extraction of it) for the Chapters cover path.

**New systems / conventions established**
- First local disk cache directory convention for the bridge (`os.UserCacheDir()` — see
  Decision 2). No temp/cache dir usage exists in Go today.
- First image-download-and-persist pipeline.

## Non-goals

- **No new "Estrenos" feature.** Exploration corrected this: "Estrenos" is merely Legacy's
  sidebar section title wrapping the season-mode filters the bridge already has. Optional
  labeling only; no premiere-tracking concept is built.
- **AnimePanel Estrenos sidebar** — explicitly deferred to sdd-31b.
- **Right-click ±0.5** — already matches Legacy identically; untouched.
- **Open/copy folder and page desktop actions** — already implemented identically; only the
  *tooltip text* (real path string) is new, not the actions.
- **No use of the `portada.type` field** — vestigial in Legacy and in the bridge; resolution
  is by string shape only.
- No redesign of the season-mode day-tab grouping beyond the optional "Estrenos" label.

## Resolved Decisions

### Decision 1 — Image transport: base64 data-URL binding (chosen) vs custom assetserver Handler

**Chosen: base64 data-URL returned in the DTO from a bound Go method.**

- *Why:* It fits the codebase's established convention — every cross-boundary read is a
  bound Go method returning a DTO. It works uniformly for both local disk paths and
  cached-remote copies with one code path. It has the smallest blast radius: no change to
  `main.go`'s `assetserver.Options`, no new HTTP surface, and no path-traversal attack
  surface (the webview never gets a file path to request; Go reads the file). Given the real
  data (**only 1 of 795 animes has a cover**), payload volume is negligible in practice.
- *Tradeoffs accepted:* ~33% base64 size overhead and no browser HTTP caching. Mitigated by
  the local disk cache (the expensive network fetch happens once) and by the placeholder-first
  reality — most cards return no image at all.
- *Rejected: custom `assetserver.Options.Handler`.* It would give native `<img src>` loading
  and real browser HTTP caching, but at the cost of new HTTP infrastructure, an invasive
  `main.go` change, and a genuine path-traversal security concern (arbitrary local-disk file
  serving). Not justified for a 1-in-795 cover rate. Revisit only if profiling on real covered
  libraries later shows base64 to be a bottleneck.

### Decision 2 — Cache directory, key, and eviction: `os.UserCacheDir()`, persistent

**Chosen: `os.UserCacheDir()/autoreas-bridge/covers/`, keyed by anime ID + content hash of
the source URL, persistent (no time-based eviction in this change).**

- *Why UserCacheDir over the user's literal "temp directory":* The user's stated goal is that
  covers **survive loss of internet.** `os.TempDir()` is subject to OS cleanup (reboot sweeps,
  disk-pressure cleaners), which would silently delete cached covers and reintroduce the exact
  failure the user wants to avoid. `os.UserCacheDir()` is the correct OS-blessed home for
  regenerable-but-persistent cached data and is not swept by the OS. **This is an intentional
  interpretation of "temp directory" as "persistent local cache," recorded here as a
  deliberate deviation from the literal wording to honor the actual intent.**
- *Key:* anime ID plus a content hash derived from the source URL, so a changed URL produces a
  new cache entry rather than serving a stale image, and there are no filename collisions.
- *Eviction:* none in this change — the cache is treated as durable. A local disk path source
  is read live (not copied into the cache); only downloaded URLs are cached. If cache-size
  management is ever needed it is a follow-up, not part of SDD-38 (given the 1-in-795 rate it
  is not a near-term concern).

### Decision 3 — Placeholder asset: promote the existing anime-detail placeholder to shared

**Chosen: promote `AnimeCoverPlaceholder.tsx` from its anime-detail feature scope to a shared
location, consumed by both Anime Detail and Chapters.**

- *Why:* The illustration and its inline-SVG pattern already exist and are proven in Anime
  Detail. Duplicating it into the chapters feature would violate the project's colocation/DRY
  intent and create two sources of truth for "no cover." Promotion gives one placeholder the
  whole app renders, satisfying the "placeholder is the default" requirement with a single
  authority. The design phase decides the exact shared path; this proposal only commits to
  *promote and share* rather than *duplicate*.

## Ready for Spec + Design

Yes. Intent, scope, and the three open decisions are resolved. `sdd-spec` and `sdd-design`
can proceed in parallel: spec captures the observable behaviors (cover resolution order,
hover-swap without truncation, danger minus, day badges, real-path tooltips, placeholder
default); design details the new Go cover-cache package, the DTO extensions, the day-count
query, and the placeholder promotion path.
