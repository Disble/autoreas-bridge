# Explore — SDD-70 MyAnimeList metadata autofill

Date: 2026-09-12
Branch: `feat/sdd-70-mal-metadata`
Worktree: `autoreas-bridge-worktrees/sdd-70-mal-metadata`

## 1. The request

Fill the Create-anime and Edit-anime forms from MyAnimeList with one button. Three explicit
requirements from the requester:

1. MyAnimeList is the source.
2. The data must be **standardized** into our vocabulary (adapter pattern).
3. The user may type a name that is **close but not exact**, so the anime exists on MAL yet a naive
   lookup would not find it.

## 2. Measured evidence

Everything below was measured live on 2026-09-12. No figure here is inferred.

### 2.1 Third-party search engines collapse on a typo

Queried AniList GraphQL (`graphql.anilist.co`, perPage 5):

| Typed | Hits |
| --- | --- |
| `Bleach: Sennen Kessen-hen` (exact) | 4 |
| `Bleach Thousand-Year Blood War` (English title) | 4 |
| `bleach sennen kessen hen` (no punctuation) | 4 |
| `sennen kessen` (partial) | 4 |
| `Bleach: Sennen Kesen-hen` (one letter off) | **0** |
| `Atack on Titan` | **0** |
| `Jujutsu Kaizen` | **0** |
| `Shokugeki no Soma` (romanization variant) | **0** |

Jikan v4's search endpoint failed **16 of 16** attempts over ~10 minutes with
`504 · Jikan failed to connect to MyAnimeList`, while its cached detail endpoint
`/v4/anime/41467` answered `200` in ~0.64 s (4/4). AniList also returned `429` after roughly eight
requests in twelve seconds.

### 2.2 MyAnimeList's own search does NOT collapse

`GET myanimelist.net/search/prefix.json?type=anime&keyword=<q>&v=1` — the endpoint behind the site's
autocomplete. Every returned item carries an `es_score` field, i.e. it is Elasticsearch-backed.

| Typed | Hits | Ranked first |
| --- | --- | --- |
| `Bleach: Sennen Kessen-hen` | 6 | Bleach: Sennen Kessen-hen |
| `Bleach: Sennen Kesen-hen` | 6 | Bleach: Sennen Kessen-hen |
| `Bleach: Senen Kesen-hen` | 6 | Bleach: Sennen Kessen-hen |
| `Atack on Titan` | 10 | Shingeki no Kyojin |
| `Shokugeki no Soma` | 9 | Shokugeki no Souma |
| `one pice` | 10 | One Piece |
| `naroto shipuden` | 10 | Naruto: Shippuuden |
| `kimetsu no yaiva` | 10 | Kimetsu no Yaiba |
| `Jujutsu Kaizen` | 10 | Jujutsu Kaisen: Shimetsu Kaiyuu **(wrong)** |
| `Shokuguemi no Soma` | **0** | — |

**Nine of ten recovered.** Typo tolerance is a property of the search ENGINE, not of the catalogue.
This finding reversed the initial design: no local fuzzy-matching architecture is required.

### 2.3 Residual gaps the local side must still cover

- **The top hit can be wrong.** `Jujutsu Kaizen` ranked a 2026 sequel first (`es_score` 68.5) above
  the real *Jujutsu Kaisen* (66.3). Re-scoring the same candidates by string similarity to the typed
  name puts the correct one first at **0.93** and drops the sequel to **0.55** (last).
  Since the user always confirms the pick, this governs presentation ORDER, not correctness.
- **One residual zero.** `Shokuguemi no Soma` returns nothing; the token is too far from
  `shokugeki`. Fallback: on zero results only, retry with the longest tokens individually.

### 2.4 Access requirements

Measured on both the search endpoint and the anime detail page:

| Request | No User-Agent | Plain app UA | Browser UA |
| --- | --- | --- | --- |
| `prefix.json` | `200`, 10 items | `200`, 10 items | `200`, 10 items |
| anime detail page | `200` | `200` | `200` |

No credentials, no cookies, no session, no headless browser. A scrape here is a plain HTTP GET.

### 2.5 Search-as-you-type is viable

Simulated keystroke-by-keystroke typing of `bleach sennen`, 11 back-to-back requests, no debounce:
all `200`, zero throttling, ~0.33 s each; hit counts narrowed 10 → 8 → 6 as the query lengthened.

The risk is therefore not rate limiting but **out-of-order responses**: at ~0.33 s per request a
later query can land before an earlier one and leave stale results under the cursor.

### 2.6 Detail page parsing

No `application/ld+json` blocks exist on the page — zero. DOM parsing is the only route.

Label-anchored extraction works: locate `<span class="dark_text">LABEL</span>`, take the rest of its
parent `div`, prefer anchor texts, else strip tags. Verified against three pages.

Available labels: `Synonyms:`, `Japanese:`, `English:`, `Type:`, `Episodes:`, `Status:`, `Aired:`,
`Premiered:`, `Broadcast:`, `Producers:`, `Licensors:`, `Studios:`, `Source:`, `Genres:`,
`Demographic:`, `Duration:`, `Rating:`, `Score:`, `Ranked:`, `Popularity:`, `Members:`, `Favorites:`.

**Six measured parser traps:**

| # | Trap | Evidence |
| --- | --- | --- |
| 1 | **The label is pluralized by count** | Bleach has `Genres:`; Sono Bisque Doll (one genre) has `Genre:`. A parser matching only the plural returns empty SILENTLY for every single-genre anime. |
| 2 | Duration has at least two shapes | `24 min. per ep.` (TV) vs `1 hr. 46 min.` (movie) |
| 3 | `Source:` is sometimes a link, sometimes bare text | `Manga` is an anchor; `Original` is plain text; Devilman Crybaby returned anchor text padded with newlines |
| 4 | Genres split across three labels | `Genres:`/`Genre:`, `Themes:`, `Demographic:` are distinct fields |
| 5 | `ONA` is a real type with no slot | Devilman Crybaby reports `Type: ONA`; our `tipo` enum holds four values |
| 6 | No structured data | zero JSON-LD blocks; prefer hidden `itemprop` microdata over visible labels where present |

Sample extraction (Bleach, `anime/41467`): `Type: TV`, `Episodes: 13`, `Duration: 24 min. per ep.`,
`Source: Manga`, `Studios: Studio Pierrot`, `Genres: Action, Adventure, Supernatural`,
`Demographic: Shounen`, `Premiered: Fall 2022`, `English: Bleach: Thousand-Year Blood War`.

## 3. Codebase map

### 3.1 Frontend — the forms to fill

- **Create**: `frontend/src/features/anime-create/ui/AnimeCreate/` — `AnimeCreate.tsx` renders a
  masonry column of `AnimeCreateRow` cards. Draft type `AnimeCreateRowDraft`
  (`anime-create.types.ts:10-30`): `draftId, name, page, folder, folderManual, kind,
  episodesWatched, totalEpisodes, duration, origin, coverType, coverPath, genres, studios`.
  State owner: `use-anime-create-rows.ts:18` (`rows`, add/remove/patch), composed into
  `use-anime-create.ts:21`. Patch type `AnimeCreateRowPatch = Partial<Omit<AnimeCreateRowDraft, 'draftId'>>`.
- **Edit**: `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/` — `AnimeEditorFormPanel.tsx`.
  Draft type `AnimeEditorDraft` (`anime-editor-workspace.types.ts:66-81`) adds `status`, `progress`,
  `premieredAt`. State owner: `use-anime-editor-record.ts:8`.
- **Cover source options** are duplicated per feature: `ANIME_CREATE_COVER_TYPE_OPTIONS`
  (`anime-create.constants.ts:14-17`) and `ANIME_EDITOR_COVER_TYPE_OPTIONS`
  (`anime-editor-workspace.constants.ts:49-52`), both `[{url|URL}, {image|Image}]`.
- **Type vocabulary** is shared and CLOSED: `ANIME_TIPO_FILTER_ENTRIES`
  (`frontend/src/shared/constants/anime-tipo.constants.ts`) — `0` Anime (TV), `1` Película,
  `2` Especial, `3` OVA. Default for a new row is `'0'` (`ANIME_CREATE_DEFAULT_KIND`).
- **Genres/Studios** are comma-separated strings in the draft, split to arrays before the wire call
  (`splitCreateCommaList` → `toOptionalCreateFields`, `anime-create.helpers.ts:216-217`).
- **Debounce precedent**: `ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS = 300`
  (`anime-create.constants.ts`), documented as existing to stop mid-word flicker.

### 3.2 Frontend — idioms to mirror, not reinvent

- **Modal**: `frontend/src/features/season/ui/RateAnimeModal/RateAnimeModal.tsx` — HeroUI v3
  compound (`Modal` > trigger `Button` + `Modal.Backdrop` > `Modal.Container` > `Modal.Dialog` >
  `Modal.CloseTrigger`/`Header`/`Heading`/`Body`), uncontrolled, logic in the colocated
  `use-rate-anime-modal.ts`.
- **Search-then-pick**: `frontend/src/features/season/ui/IntakePanel/IntakeRow.tsx:54-62` maps
  `row.candidates` to `Button`s calling `onResolve`; `formatCandidateOption`
  (`intake-panel.helpers.ts:64`) labels them.
- No MyAnimeList / Jikan / AniList integration, search modal, or autocomplete component exists
  anywhere under `frontend/src/` today.

### 3.3 Backend — Go

- **Create service**: `internal/anime/create_service.go` — `CreateService.CreateAnime` /
  `CreateBatch`; persistence in `internal/anime/write_service.go`. `CreateMetadata{AnnouncedTotal,
  DurationMinutes, CoverURL, LatestEpisode}` is an EXISTING gap-filling enrichment seam on the
  create path — user-provided values always win.
- **Editor update**: `internal/anime/editor_service.go` — `EditorService.Save`; `EditorPatch`
  (`internal/anime/store/editor_mutation.go:48-65`) carries every field a form would submit.
- **Wails binding convention**: methods on `*App` in `internal/desktop/`, single return value, no
  `(data, error)`. Errors fold into the result struct as `Outcome`
  (`applied|no_op|conflict|error`) + `Message`. See `internal/desktop/app_runtime_editor.go:15-17`.
- **Outbound HTTP precedent to mirror**: `internal/anime/cover/http_fetcher.go` — `httpFetcher`
  struct, `NewHTTPFetcher(timeout, maxBytes)`, `http.NewRequestWithContext`, status check, and
  `io.LimitReader` body cap. Port/adapter naming to copy: port `Fetcher`, adapter `httpFetcher`,
  constructor `NewHTTPFetcher` (`internal/anime/cover/types.go`).
- **Scraper precedent**: `internal/download/sites/jkanime/search.go` — `Searcher` wrapping
  `*http.Client` with an explicit User-Agent. No retry/backoff logic exists anywhere.
- **Storage**: genres and studios are JSON arrays inside the `snapshot_json` blob of
  `anime_snapshots` (`internal/sync/schema.go:27-36`). **No migration is required** for this change.
- **Covers** are fetched only at DISPLAY time by `internal/anime/cover/resolver.go` (disk cache
  keyed by `sha256(sourceURL)` under `os.UserCacheDir()`), so storing a cover URL at create time
  costs nothing.
- Nothing related to MyAnimeList, Jikan, AniList or metadata scraping exists in `internal/` today.

## 4. Confirmed product decisions

All four were decided by the requester during exploration and are CONFIRMED — the proposal phase
must not re-interview them.

| Dimension | Decision |
| --- | --- |
| Source | Scrape MyAnimeList directly. No Jikan, no community proxy, no API key. |
| Architecture | Its own independent module, isolated from the anime domain, with **noisy** typed errors on markup drift. |
| Retrieval | Two stages: `prefix.json` search, then the anime page — fetched ONLY after the user confirms a candidate. |
| UX | A button on the form opens a modal; its own search field is pre-filled from `Name` on first open and refines as you type; candidate cards; **the user always confirms**. No silent autofill. |
| Scope | Only the fields the forms already have. `Genres` only — `Themes:` and `Demographic:` are left UNPARSED, not parsed-and-discarded. |

Requester's stated rationale for the modal: *"esto es para evitar autoescoger mal, el usuario tiene
la palabra final y eso hará que la resolución de conflictos sea menor."*

Consequence worth carrying into design: because the user always confirms, no score threshold or
runner-up margin decides anything. The confidence machinery an auto-fill design would need does not
exist in this one.

Fields MAL can never supply, which the button must not touch: **Download page** (a jkanime URL),
**Folder** (a local disk path), **Watched episodes** (the user's own progress).

Legal note recorded once: scraping falls outside MyAnimeList's terms of use. The concern was raised
and the requester reaffirmed the decision.

## 5. Drift recorded (CLAUDE.md #2)

Two instruction/repository mismatches found while preparing this change. Recorded, not fixed here.

1. **`.atl/skill-registry.md` is unreachable from any worktree.** `CLAUDE.md` → "Read First" lists
   it as required reading, but `.atl/` is untracked in git (`git ls-files .atl` is empty) and exists
   only in the primary checkout. Every git worktree therefore starts without it.
2. **`bridge-testing` and `bridge-debugging` do not exist.** `CLAUDE.md` notes #5 and #6 instruct
   agents to load them for bridge test work and for regression investigation respectively. Neither
   resolves locally (`.claude/skills/`) nor globally (`~/.claude/skills/`).

### Addendum (Slice 8, apply phase) — item 1's consequence measured, item 2 re-verified

3. **Item 1's consequence, verified rather than assumed:** `.atl/active-sdd-change` is not merely
   unreachable, it is load-bearing, and it can never be committed. `.atl/` is listed in `.gitignore`
   (lines 6, 18, 19, 28). `tools/checksdd/main.go`'s `detectActiveChange` reads that marker first;
   only when it is absent or empty does it fall back to scanning `openspec/changes/` for
   non-`archive` directories, and that fallback returns an error the moment more than one such
   directory exists. This repository has 37 non-archived change directories today, so the fallback
   **always** errors in practice — the marker file is the only path that ever resolves a single
   active change. A freshly created worktree therefore starts unable to `git commit` at all until
   someone recreates `.atl/active-sdd-change` by hand, naming the active change. This worktree
   already carries it (verified present, content `2026-09-12-sdd-70-mal-metadata`), so this change's
   own commits are unaffected; the gap reproduces for the next fresh worktree that skips this step.
   No fix is in scope for this change. See `docs/adr/022-myanimelist-metadata-source.md`.
4. **Item 2, re-verified during apply:** `bridge-testing` and `bridge-debugging` still resolve to
   nothing, locally or globally, as of this phase.

## 6. Risks carried into the proposal

| Risk | Standing | Mitigation |
| --- | --- | --- |
| `prefix.json` is undocumented | it is the site's own autocomplete, not a published API | behind the module boundary, with fixture + opt-in live contract tests |
| Markup drift breaks the parser silently | measured trap #1 is exactly this failure | required-anchor set aborts loudly; optional fields degrade visibly |
| Out-of-order search responses | measured ~0.33 s per request | debounce 300 ms, min 3 chars, drop non-newest responses, cache by normalized query |
| Unmapped `media_type` (`ONA`, `Music`) | measured on a real page | leave the field at default and report it unfilled; never silently file as TV |
| Non-Latin input | NOT measured | one probe before the search slice is written |

## 7. Recommendation

Proceed to proposal. The product decisions are confirmed, the evidence is measured and reproducible,
and no research lane is outstanding.
