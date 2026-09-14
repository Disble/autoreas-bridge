# Proposal: MyAnimeList Metadata Autofill (SDD-70)

## Intent

Adding or editing an anime means hand-typing type, episode count, duration, source, studios and
genres that MyAnimeList already publishes. The obstacle was never the data but the lookup: a user
types a name that is close, not exact. Third-party search collapses on exactly that — AniList
returned **zero** hits for `Atack on Titan`, `Jujutsu Kaizen` and a one-letter-off
`Bleach: Sennen Kesen-hen`, and Jikan's search failed **16 of 16** with `504`
(`explore.md` § 2.1). MAL's own autocomplete recovered **nine of those ten**
(`explore.md` § 2.2), because typo tolerance is a property of the search engine, not the catalogue.
One button, against the one source that can find what the user actually typed.

## Scope

### In Scope

- `internal/myanimelist/`: a new module speaking MAL's vocabulary, importing nothing from
  `internal/anime`. Two-stage retrieval, typed errors, fixture-backed parser.
- Stage 1 — `GET /search/prefix.json?type=anime&keyword=<q>&v=1`, which returns the whole candidate
  card (id, name, image, `media_type`, `start_year`, `score`) with **no page fetched**.
- Stage 2 — scrape `/anime/{id}/{slug}` **only after the user confirms** a candidate.
- Wails bindings on `*App`, folding failure into `Outcome` + `Message`
  (`internal/desktop/app_runtime_editor.go:15-17`).
- The MAL → form mapping, living **outside** the MAL module.
- A **Fetch metadata** button on each Create row card and on the Edit form panel, disabled while
  Name is empty; it opens a lookup modal with its **own** search field, pre-filled from Name on
  first open only, refining as the user types. Selection changes nothing; a primary button confirms.
- A report of which optional fields came back unfilled.

### Out of Scope

- **Silent autofill.** The user always confirms, so no score threshold, runner-up margin or
  confidence machinery exists anywhere in this design. Local re-ranking governs presentation ORDER
  only (`explore.md` § 2.3).
- `Themes:` and `Demographic:` — left **unparsed**, not parsed-and-discarded.
- Download page, Folder, Watched episodes, and the editor's `status`. See the mapping trap below.
- Schema or migration work. Genres and studios already live inside `snapshot_json`
  (`internal/sync/schema.go:27-36`).
- The backend `CreateMetadata` enrichment seam (`internal/anime/create_service.go`). This change
  fills the **form**, not the create command; the user still reviews every value before submit.
- Jikan, AniList, API keys, retry/backoff.
- REST/WS surface. These are Wails bindings, desktop-only: `docs/openapi.yaml` owes nothing.

## Capabilities

### New Capabilities

- `myanimelist-metadata-source`: two-stage retrieval, the required-anchor set, typed errors on
  markup drift, and the MAL-vocabulary result it returns.
- `anime-metadata-autofill`: the button, the confirm-first lookup modal, the MAL → form mapping,
  the never-touched field set, and unfilled-field reporting.

### Modified Capabilities

- `anime-create-editor`: **"No modal-over-modal, no chip inputs"**
  (`openspec/specs/anime-create-editor/spec.md:84-95`) currently reads *"It MUST NOT nest a modal
  dialog inside the tab"* — absolute. The confirmed UX nests exactly one. The delta must narrow it
  to what the requirement was protecting: the Create **surface** still may not be a modal layered
  over the workspace, chip inputs stay forbidden, and optional-metadata disclosure stays inline —
  while a user-invoked, transient lookup dialog is permitted.

No delta against `anime-editor` or `anime-create-canonical`. Autofill patches the same drafts the
user could type by hand, so unsaved-change guards, single-save authority, and canonical
serialization are untouched.

## Approach

**The mapping trap that must not ship.** MAL's `Status:` is airing status; the editor's `status`
field is the user's own watching estado (`ANIME_ESTADO_VALID_VALUES`,
`anime-editor-workspace.constants.ts:55`). Same word, different vocabulary. `Status:` is a required
parse **anchor** and fills **nothing** — which is precisely why the mapping lives outside the MAL
module: a module that knows only MAL's words cannot make this mistake on our behalf.

**Go.** Ports and adapters mirroring `internal/anime/cover/http_fetcher.go` — port `Fetcher`,
adapter `httpFetcher`, `NewHTTPFetcher(timeout, maxBytes)`, context-carrying request,
`io.LimitReader` cap. Errors are **noisy**: a missing required anchor (title heading, `Type:`,
`Status:`) returns a typed error naming the anchor and aborts the whole fetch; optional fields
absent leave the value empty and are reported. Trap #1 in `explore.md` is exactly the failure a
quiet parser produces — `Genres:` is singular `Genre:` on a single-genre anime, so a plural-only
match returns empty forever without a symptom.

**Frontend.** The modal is consumed by two features, which per `CLAUDE.md` § 12b puts it in its own
`frontend/src/shared/` module rather than inside either feature. HeroUI v3 compound modal
(`RateAnimeModal` is the reference), and per `autoreas-theme` the result list owes three
**exclusive** states: shape-mirroring skeleton, `AirisEmptyState`, error `Alert`. The measured risk
is not rate limiting — 11 back-to-back keystroke requests were all `200` at ~0.33 s — but
**out-of-order responses**: debounce (precedent `ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS = 300`), a
minimum query length, and dropping every response that is not the newest.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/myanimelist/` | New | search client, page parser, typed errors, fixtures |
| `internal/desktop/` | New | Wails bindings, `Outcome`/`Message` result |
| `frontend/src/shared/<lookup-module>/` | New | modal, hook, MAL → form mapping helpers |
| `frontend/src/features/anime-create/ui/AnimeCreate/` | Modified | button on the row card; applies an `AnimeCreateRowPatch` |
| `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/` | Modified | button on the form panel; patches `AnimeEditorDraft` |
| `openspec/specs/anime-create-editor/` | Modified | delta narrowing the nested-modal prohibition |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scraping falls outside MAL's terms of use | Certain | **Accepted.** Raised once and reaffirmed by the requester; recorded, not re-litigated |
| `prefix.json` is undocumented and may change | Med | Confined behind the module boundary; fixture tests plus opt-in live contract tests |
| Markup drift breaks the parser silently | High without work | Required-anchor set aborts loudly; optional fields degrade visibly, never silently |
| Unmapped `media_type` (`ONA`, `Music`) — our `tipo` holds four values | Med | Leave the field at its default and report it unfilled; never file an `ONA` as TV |
| Stale results under the cursor | Med | Debounce, minimum length, drop non-newest |
| Non-Latin input | Unknown — **not measured** | One probe before the search slice is written |
| Exceeds the 400-line review budget | High | Slice it. Per `CLAUDE.md` § 22, `sdd-tasks` must measure comparables with `wc -l` rather than forecast by eye |

## Rollback Plan

Revert the slice. The module is new, no schema or migration is involved, and nothing on disk or in
the database records that autofill ever ran — the values it writes are indistinguishable from typed
ones. The only edits to existing code are the two buttons and their wiring, so a reverted build
returns to hand-typed forms exactly as today. No consumer outside this repository is affected.

## Dependencies

None. No API key, no credentials, no cookies, no headless browser: both endpoints answered `200`
with and without a browser User-Agent (`explore.md` § 2.4). An HTML parsing dependency may be
introduced; the page carries **zero** `application/ld+json` blocks, so DOM parsing is the only route.

## Open Question for Design

`premieredAt` exists on `AnimeEditorDraft` but is deliberately absent from `AnimeCreateRowDraft`,
documented there as *"an auto lifecycle field, never user input"* (`anime-create.types.ts:4-9`).
MAL supplies `Premiered:`. Whether the Edit form's copy is autofillable is a field-ownership
question the design phase must settle; the confirmed scope rule ("only fields the forms already
have") does not resolve it on its own.

## Success Criteria

- [ ] A typo'd name (`Atack on Titan`, `Jujutsu Kaizen`) surfaces the correct anime among the
      candidates, with the correct one ranked first after local re-scoring.
- [ ] No anime page is fetched until the user confirms a candidate — asserted, not reasoned.
- [ ] A single-genre anime (`Genre:`) fills its genre. A missing required anchor returns a typed
      error naming the anchor and fills nothing.
- [ ] Cancel leaves the form byte-identical; confirm never writes Download page, Folder, Watched
      episodes, or the watching estado.
- [ ] The lookup list renders all three states, and each loading test asserts the negative.
- [ ] `internal/myanimelist` imports nothing from `internal/anime` — enforced, not reviewed.
- [ ] Both golangci profiles, `go test ./...`, the frontend suite, `checkgofilesize` with an empty
      baseline, and `render:smoke` pass; `docs/openapi.yaml` has no diff.
