# Design: MyAnimeList Metadata Autofill (SDD-70)

## Technical Approach

Three packages, three vocabularies, two translation hops. `internal/myanimelist` speaks **only** MAL's
words (`Type: TV`, `Source: Manga`) and is forbidden by depguard from importing `internal/anime`.
`frontend/src/shared/metadata-lookup/` performs hop one — MAL vocabulary → bridge vocabulary
(`TV` → `kind '0'`) — and each feature performs hop two — bridge vocabulary → its own draft patch.
No single module knows both ends, which is what makes the `Status:` trap
(airing status vs the user's watching `estado`) structurally unavailable rather than merely
documented.

Retrieval is two-stage and confirm-gated: `prefix.json` per keystroke, the anime page **only** after
the user confirms a candidate. Everything else in the design serves one of two invariants — the
noisy-error contract (D2) and response ordering (D7).

## Architecture Decisions

### D1 — HTML parsing: `golang.org/x/net/html`, not `regexp`

**This is a robustness choice, not a feasibility one.** Label-anchored extraction was **proven with
plain `regexp` during exploration** — `regexp` works today. The decision is about which one keeps
working, and at what price.

| | |
|---|---|
| **Choice** | `golang.org/x/net/html`. It is **already in the module graph** — `go.mod:54`, `golang.org/x/net v0.56.0 // indirect`, pulled in by Wails and pinned in `go.sum`. Adoption is a one-line promotion from indirect to a direct `require` against a version the build already resolves: **`go.mod` gains one line, `go.sum` does not change at all.** No new download, no new supply-chain surface. The `html` package pulls only stdlib plus `html/atom`. |
| **Price paid** | `html.Parse` builds a full DOM. Bounded by the `io.LimitReader` cap, and it runs **once per confirmed selection**, never per keystroke. Plus one direct dependency the repository did not previously declare. |
| **Rejected — `regexp`** | Feasible (proven in exploration) but structurally fragile at the one place this parser lives: the rule is *"locate `<span class="dark_text">LABEL</span>`, take the **rest of its parent div**"*, and "the rest of the parent element" is a tree relation. A regex must guess the matching `</div>` and cannot count nesting, so trap #4 — `Genres:`/`Themes:`/`Demographic:` as adjacent sibling blocks — is one greedy quantifier away from reading the next field's value as this one's. The `jkanime/search.go:17` precedent holds because its target is a single flat `<h5><a href>` pattern with no nesting to cross. Given that both work, the tie breaks on the failure mode: a regex that drifts returns a *plausible wrong value*, a tree walk that drifts returns *no node*, and D2 turns "no node" into a loud error. |
| **Rejected — `goquery`** | A genuinely new module (plus `andybalholm/cascadia`) buying a CSS-selector layer over the same `x/net/html` tree we would already hold. |
| **Rejected — headless browser** | Measured unnecessary: plain GET returns `200` with and without a browser UA (explore § 2.4). |

**Traps #1 and #3 are parsing-layer concerns and are discharged here, not in any mapping helper.**
Trap #1 (`Genre:` singular on a single-genre anime) is handled by the locator's accepted-label
**set**, so the mapper never sees a plural/singular distinction. Trap #3 (`Source:` returning anchor
text padded with literal newlines and spaces) is handled by `strings.TrimSpace` inside the extractor,
so the mapper never sees padding. Either trap leaking past `parse.go` into
`metadata-lookup.helpers.ts` is a design violation, not a detail.

Each field declares an **ordered locator list**: `itemprop` microdata first where a pinned fixture
proves one exists (it survives rewording), label-anchored second. Which fields carry `itemprop` is
read off the fixtures in slice 2a — the explore establishes the preference, not the inventory. Adding
a microdata locator is therefore data, not structure.

### D2 — The noisy-error contract (three tiers, and a third outcome)

Every label falls in exactly one tier. The rule that assigns it:

> **A field is an ANCHOR when its absence can only mean the markup changed. It is OPTIONAL when its
> absence can mean the anime genuinely lacks it.**

| Tier | Labels | Absence → | Value used? |
|---|---|---|---|
| **Anchor** | title heading, `Type:`, `Status:` | `*DriftError{Anchor}` — aborts the **whole** fetch | only `Type:`; `Status:` is presence-checked and **discarded** |
| **Mapped** | `Episodes:`, `Duration:`, `Source:`, `Studios:`/`Studio:`, `Genres:`/`Genre:` | leave empty, append to `Unfilled` | yes |
| **Unparsed** | `Premiered:`, `Themes:`, `Demographic:`, `Aired:`, `Broadcast:`, `Producers:`, `Licensors:`, `Rating:`, `Score:`, `Ranked:`, `Popularity:`, `Members:`, `Favorites:`, `Synonyms:`, `Japanese:`, `English:` | nothing — never read | no |

Those three are anchors because they are present on every anime page independent of the anime's own
properties. `Episodes:`, `Studios:` and `Genres:` are excluded precisely because their presence
tracks the anime, not the markup.

**The third outcome, which is where a quiet parser actually fails.** Present-but-unparseable is
**not** optional absence — it is drift:

| | absent | present, parsed | present, unrecognized shape |
|---|---|---|---|
| Anchor | `DriftError` | ok | `DriftError` |
| Mapped | `Unfilled` | ok | **`DriftError`** |

So `Duration: 24 minutes/episode` (a reworded shape) returns `DriftError{Anchor:"Duration:"}` and
**never `0`**. Same for `Episodes:` holding neither digits nor the literal `Unknown`. A zero written
silently into a form is the failure this whole contract exists to prevent.

Trap #1 falls out of the locator design: the label locator takes a **set** of accepted labels
(`{"Genres:","Genre:"}`, `{"Studios:","Studio:"}`), and a single-genre fixture pins it.

Free consequence worth stating: a body truncated by `io.LimitReader` loses its trailing anchors, so
the anchor set **is** the truncation detector. No second mechanism is needed.

### D2a — `parseDurationMinutes` is a named function with an exact arithmetic contract

Duration is the one mapped field whose value is **computed**, not copied, so it is the one that can
be wrong while looking right. It gets its own function in `parse.go`, unit-tested directly:

```go
// parseDurationMinutes converts a MAL `Duration:` value into whole minutes.
// An unrecognized shape returns ok=false; the caller raises *DriftError, never 0.
func parseDurationMinutes(raw string) (minutes int, ok bool)
```

| Input | Output | The assertion that matters |
|---|---|---|
| `24 min. per ep.` | `24` | — |
| `1 hr. 46 min.` | **`106`** | `60*1 + 46`. **The hour component is not dropped.** |
| `2 hr.` | `120` | hours alone still multiply |
| `2 hr. 5 min.` | `125` | two-digit carry |
| `46 min.` | `46` | — |
| `24 minutes/episode` | `ok=false` | → `*DriftError{Anchor:"Duration:"}` |
| `Unknown` | `ok=false` | → `*DriftError` (absence is the label being missing, not this) |

`106` is the load-bearing row. The obvious bug — parsing `1 hr. 46 min.` by taking the first integer
— yields `1`, which is a *plausible* duration for nothing and passes any test phrased as "a parsed
duration is present". The spec pins the value, and so does this table; the test asserts the
literal `106`, never a value re-derived from the production constant.

### D3 — Opt-in live probe: environment variable, not a build tag

`MYANIMELIST_LIVE=1`, with `t.Skip` when unset.

| | |
|---|---|
| **Rejected — `//go:build mal_live`** | A tag removes the file from the default build, so `go test ./...`, `go vet` and golangci **never compile it**. It rots silently: the day a parser signature changes, the probe stops compiling and nobody learns until someone remembers the tag exists. |
| **Rationale** | The env-var form compiles on every run and skips at runtime, so it stays type-correct for free, and `go test ./...` prints a visible `SKIP` that advertises the probe. The gate is unaffected either way — `lefthook.yml` sets no variable, so a MAL outage can never block an unrelated commit, which is the actual requirement. |

The probe asserts **only** that every required anchor is present and the parse returns no
`DriftError`. It never asserts values: score, rank and members change hourly, and pinning them makes
it flaky for a reason that is not drift.

### D4 — Wails bindings: single return, `Outcome` + `Message`

```go
// internal/desktop/app_myanimelist.go
func (a *App) SearchMyAnimeList(query string) contracts.MyAnimeListSearchResult
func (a *App) GetMyAnimeListDetail(malID int) contracts.MyAnimeListDetailResult
```

| Condition | `Outcome` (`internal/api/contracts/services.go:33-36`) |
|---|---|
| candidates returned | `AnimePatchOutcomeApplied` |
| **zero** candidates | `AnimePatchOutcomeNoOp` — an empty result is not an error; the UI renders `AirisEmptyState` |
| `*DriftError`, transport failure, non-`200` | `AnimePatchOutcomeError`, `Message` naming the anchor |
| `AnimePatchOutcomeConflict` | **unused** — no optimistic-concurrency dimension exists here. Do not invent one. |

The DTO lives in `internal/api/contracts/myanimelist.go` (flat strings/ints, same role as
`AnimeEditorRecordResult`); the domain→DTO conversion lives in `internal/desktop`, so
`internal/myanimelist` never imports `contracts` either.

### D5 — Isolation is enforced, not reviewed

New depguard rule in `.golangci.yml`, beside `domain-purity` / `wails-confined-to-edge`:

```yaml
myanimelist-speaks-only-mal:
  files: ["**/internal/myanimelist/**"]
  deny:
    - pkg: "autoreas-bridge/internal/anime"
      desc: "internal/myanimelist speaks MyAnimeList's vocabulary only; the MAL→bridge mapping lives outside it"
    - pkg: "autoreas-bridge/internal/api/contracts"
      desc: "the MAL module returns MAL-shaped values; the DTO conversion belongs in internal/desktop"
```

`deny.pkg` is a prefix match, so `internal/anime/cover` is covered. **`internal/anime/cover` is a
pattern to copy, never a package to import** — port `Fetcher`, adapter `httpFetcher`,
`NewHTTPFetcher(timeout, maxBytes)`, `http.NewRequestWithContext`, status check, `io.LimitReader`.

### D6 — Frontend module placement and layout

Consumed by two features → `shared/`, per CLAUDE.md § 12b. Shape mirrors `shared/ordering/`
(root `*.types.ts`/`*.helpers.ts` + `ui/<Widget>/`). **No `index.ts`** (ADR-011); concrete-path
imports only.

```
frontend/src/shared/metadata-lookup/
├── metadata-lookup.types.ts          AnimeMetadataCandidate, AnimeMetadataSelection, LookupState
├── metadata-lookup.helpers.ts        MAL vocab → bridge vocab; normalizeLookupQuery;
│                                     meetsMinimumQueryLength; rankCandidates
├── metadata-lookup.constants.ts      debounce, the two length floors, tipo map, skeleton count
├── __tests__/
└── ui/AnimeMetadataLookupModal/
    ├── AnimeMetadataLookupModal.tsx        HeroUI v3 compound (RateAnimeModal.tsx is the shape)
    ├── AnimeMetadataLookupCandidate.tsx
    ├── use-anime-metadata-lookup.ts        strict hook anatomy
    ├── anime-metadata-lookup.constants.ts  labels, shared row-shape class
    └── __tests__/
```

**The mapping splits in two, and the split is the point.** The shared module must not import feature
types (`shared → features` is the wrong direction), so it emits a neutral
`AnimeMetadataSelection`; each feature owns the last hop against its own draft:

- `features/anime-create/ui/AnimeCreate/anime-create-metadata.helpers.ts` → `toCreateRowPatch(selection): AnimeCreateRowPatch`
- `features/anime-editor/ui/AnimeEditorWorkspace/anime-editor-metadata.helpers.ts` → `toEditorDraftPatch(selection): Partial<AnimeEditorDraft>`

A single shared mapper would have to know both drafts, and the drafts genuinely differ (create has
no `status`/`progress`/`premieredAt`).

### D7 — Newest-wins is a sequence counter, not an `AbortController`

```ts
const requestSeq = useRef(0);

const runSearch = useCallback(async (raw: string) => {
  const query = normalizeLookupQuery(raw);
  if (!meetsMinimumQueryLength(query)) { setState(idleState); return; }   // script-aware, D7a
  const cached = cacheRef.current.get(query);
  if (cached !== undefined) { setState(resolvedState(cached)); return; }  // no request at all
  const seq = ++requestSeq.current;
  setState(loadingState);
  const result = await source.SearchMyAnimeList(query);
  if (seq !== requestSeq.current) return;              // ← every non-newest response is dropped
  cacheRef.current.set(query, result.candidates);
  setState(fromResult(result));
}, [source]);
```

A Wails-generated binding is an IPC promise with **no `AbortSignal` parameter**, so there is nothing
to abort — the stale response *will* arrive, and the only question is whether it is applied. The
counter answers that in the same tick as `setState`. Cache is keyed by the **normalized** query
(case-folded, collapsed whitespace), so re-typing a prefix costs no request.

| Control | Value | Why |
|---|---|---|
| Debounce | `METADATA_LOOKUP_DEBOUNCE_MS = 300` | Same number as `ANIME_CREATE_NAME_CHECK_DEBOUNCE_MS`, **declared separately** — importing a feature constant into `shared/` is the wrong direction, and the reasons differ (that one is local anti-flicker; this one spares a round trip). |
| Minimum length | `meetsMinimumQueryLength(query)` — **script-aware**, see D7a | A flat constant is wrong across scripts. **Measured**, not chosen. |
| Ordering | monotonic `requestSeq` | above |

**No effect drives the search.** It fires from the field's change handler and from the modal's
`onOpenChange`; a `hasSeededRef` makes the Name pre-fill first-open-only. The hook's *only* effect is
the teardown `useEffect(() => () => clearTimeout(timerRef.current), [])`. Feature `.tsx` files stay
free of `useEffect` and of business logic.

### D7a — The minimum-length floor is script-aware, because characters are not comparable units

Probed live against `prefix.json` on 2026-09-12. **Two kanji are a complete title; two Latin letters
are nothing.**

| Query | Code points | Result | Verdict |
|---|---|---|---|
| `鬼` | 1 | 10 hits — thematic keyword matches, not title matches | below floor |
| `銀魂` | 2 | 10 hits, top = **Gintama** — exact, complete title in two characters | must pass |
| `ナル` | 2 | 10 hits, top = **Naruto** — exact | must pass |
| `進撃の` | 3 | top = Shingeki no Kyojin | must pass |
| `進撃の巨人` | 5 | top = Shingeki no Kyojin | must pass |
| `bl` | 2 | 10 hits, top = *Black Lagoon: Roberta's Blood Trail* — generic noise | below floor |
| `ble` | 3 | top = Bleach: Sennen Kessen-hen | must pass |
| `''` / whitespace | 0 | — | below floor (code boundary, not a probe) |

A flat `MIN_QUERY_LENGTH = 3` would have **rejected `銀魂` and `ナル`** — exact, correct queries that
return the right anime first — while admitting `bl`, which is noise. So the floor is a property of
the script, not of the string length. One-character CJK stays below it: `鬼` ("demon") returns keyword
matches across unrelated titles, the same low-signal result the Latin floor exists to suppress.

The first seven rows are measured probes; the eighth is the empty-input boundary the helper must
still handle. All eight are rows of one table test.

```ts
/**
 * Whether a query carries enough signal to search. The floor is 2 when the query
 * contains any non-Basic-Latin code point and 3 otherwise, because a character's
 * information content is script-dependent.
 */
export function meetsMinimumQueryLength(query: string): boolean {
  const codePoints = [...query];
  const hasNonLatin = codePoints.some((character) => (character.codePointAt(0) ?? 0) > 127);
  const floor = hasNonLatin ? METADATA_LOOKUP_MIN_LENGTH_WIDE : METADATA_LOOKUP_MIN_LENGTH_LATIN;
  return codePoints.length >= floor;
}
```

`METADATA_LOOKUP_MIN_LENGTH_WIDE = 2`, `METADATA_LOOKUP_MIN_LENGTH_LATIN = 3`.

Three implementation details that are easy to get silently wrong:

- **Compare code points numerically (`> 127`), never with a regex character-class range.** A range
  whose bounds are written as literal control characters is invisible in an editor and turns the file
  into a binary blob that grep and review both refuse to read. It happened twice while drafting this
  very document, which is why the shipped form carries no range at all. If a regex is ever preferred
  here, it must use the `u` flag with a named property escape, never a numeric range.
- **Count code points, not `String.length`.** `String.length` counts UTF-16 code units, so a
  supplementary-plane character (`𠮷`, U+20BB7) counts as 2 and would clear a floor of 2 on its own.
  Spreading into `codePoints` once serves both the detector and the count, so the two can never
  disagree.
- **It returns a boolean, not the floor.** A `minQueryLength(query): number` variant reads more
  naturally but moves the comparison to the call site, where the obvious `query.length < floor`
  reintroduces the UTF-16 bug the helper just avoided: for `𠮷` the floor is 2 and `query.length` is
  also 2, so a single character passes a floor it should sit below. Returning the verdict keeps the
  code-point count inside the one function the table test covers.

Accepted consequence, stated rather than discovered later: an accented Latin query (`Ré`) takes the
wide floor of 2 even though it is not CJK. Harmless — it lowers a floor by one on a script whose
two-character queries are rare — and the alternative, per-script Unicode property escapes, buys
precision this decision does not need while still failing for Cyrillic, Thai and Arabic titles, which
have the same property.

### D8 — Three states, made exclusive by construction

`LookupState = 'idle' | 'loading' | 'resolved' | 'failed'` — **one discriminant**, so there is no
reachable state where two branches render. That is the structural answer to the
`isLoading && rows.length > 0` trap the theme skill records.

```tsx
{state === 'loading' ? <CandidateSkeletonList /> : null}
{state === 'failed' ? <Alert status="danger">…</Alert> : null}
{state === 'resolved' && candidates.length === 0 ? <AirisEmptyState … /> : null}
{state === 'resolved' && candidates.length > 0 ? candidates.map(renderCandidate) : null}
```

Status region copied verbatim from the skill: `role="status"` + `aria-live="polite"` +
`aria-labelledby` → an `sr-only` span holding `METADATA_LOOKUP_LOADING_LABEL`. One shared
`METADATA_LOOKUP_CANDIDATE_ROW_CLASS` on both the real candidate and its placeholder;
`METADATA_LOOKUP_SKELETON_ROW_COUNT` placeholders. A fixture is added to
`frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx` that **imports** the component and
the class constant (a fixture restating the markup keeps passing after the component regresses).
Every loading test asserts the negative: no candidate is in the document while loading.

### D9 — Field-level undo: the pre-image of the patch's own keys

**Confirmed in scope** by the orchestrator: it is part of the approved UX — *nothing is clobbered;
Undo reverts exactly those fields*.

```ts
export interface AppliedMetadata<TPatch> {
  readonly patch: TPatch;
  readonly previous: TPatch;                        // same keys, values as they were pre-apply
  readonly appliedFields: readonly (keyof TPatch)[];
  readonly unfilled: readonly string[];
}
```

`buildUndoPatch(draft, patch)` is pure: it reads `Object.keys(patch)` and copies the *current* draft
value for each key. Undo replays `previous` through the same patch channel the user's own typing
uses. A **full draft snapshot was rejected** — it reverts fields the user edited *after* the
autofill, which is a rollback of their typing, not an undo. Held in the feature's existing state
owner (`use-anime-create-rows.ts`, `use-anime-editor-record.ts`), one depth, not persisted.

**Stated limit:** editing an autofilled field and *then* undoing returns it to its pre-autofill
value, discarding that edit. Avoiding it needs per-field dirty tracking neither draft has.

### D10 — Autofilling `name` re-derives `folder`, and that is correct

`folder` is a never-touch field, yet `name` is the highest-value autofill (`Atack on Titan` →
`Shingeki no Kyojin` is the whole point of the change). The create row derives `folder` from `name`
unless `folderManual` is set (`anime-create.types.ts:15-16`).

Resolution: the mapping applies `name` through the **same `onRowChange` channel typing uses**. The
autofill therefore never *writes* `folder`; the form's own existing derivation reacts to a name
change exactly as it would to a hand-typed one. Required RED tests, so a verifier does not read the
derived folder as a violation: a row with `folderManual: false` derives its folder from the applied
name; a row with `folderManual: true` keeps its folder byte-identical.

### D11 — Local re-ranking lives in the frontend; there is no automatic retry

Re-ranking is presentation order only (the user always confirms), it needs the query already in the
hook, and keeping it out of Go lets the Go fixture test assert **MAL's own order** — an honest
contract. `rankCandidates(candidates, query)` is a pure helper using a normalized
Levenshtein ratio over case-folded, punctuation-stripped strings. Its test pins the measured case
from explore § 2.3 (`Jujutsu Kaizen` → the real *Jujutsu Kaisen* outranks the 2026 sequel) and
asserts **order, never the 0.93/0.55 scores** — those belong to the explore's metric, not to ours.

**The zero-result token fallback does not exist in this change** (orchestrator decision, settled —
the question is not *where* it lives, it is *whether* it exists, and it does not). Explore § 2.3
proposed retrying with the longest tokens on zero hits, for the one residual case
(`Shokuguemi no Soma` → 0). The confirmed UX gives the modal **its own editable search field**, so
that case is recoverable by typing; an automatic retry would add a second retrieval strategy, its
tests and a DTO field to serve a case the UX already answers — against a change already measured at
7-10× the review budget. `search.go` therefore performs **exactly one request per query**, and
`SearchResult` carries **candidates only**. A zero-hit search is a plain `AnimePatchOutcomeNoOp`.

The recovery affordance is the empty state's **copy intent** (D8): `AirisEmptyState` names the query
that found nothing and invites the user to refine it in the field already focused above — shorter, or
a different romanization. It offers **no recovery action button**, because the recovery control is
the search field itself, and a button that only refocuses it is noise.

### D12 — The delivery unit is the commit, not the PR

**Settled by the orchestrator: `size:exception` is ACCEPTED at the branch level.** The PR is not this
repository's delivery unit — it has exactly one PR in its entire history, and work lands as a series
of commits on `dev`. That is also why `single-pr` was the cached strategy; it describes how this repo
ships, not a budget being waived.

The unit that must respect a budget is therefore the **commit**, governed by CLAUDE.md § 22 at
roughly **600 changed lines** (insertions + deletions, artifact prose included).

`sdd-tasks` inherits this rather than re-deciding it:

- The eight slice boundaries below stand as the recommended split.
- **Every slice must land within the ~600-line per-commit band.**
- Any slice whose measured band reaches or exceeds it **subdivides before apply** — the cap is a
  pre-commit discipline (§ 22), so the lines must not be written, not be removed afterwards.
- An overrun that still happens is an over-engineering finding: refactor it down and **continue**.
  Never block a work unit on it, and never reset the ledger objective.

Taking the Sizing bands plus 40-80 lines of artifact prose, three slices need subdividing now:

| Slice | Band | Subdivision |
|---|---|---|
| 2 — `detail.go` + `parse.go` + traps | ~560-730 | **2a** `parse.go` locators, extractors, `parseDurationMinutes` + unit tests over HTML fragments · **2b** `detail.go` orchestration, anchor gate, `Unfilled`, httptest integration + the drift fixture |
| 4 — shared module, no UI | 455-625 | **4a** types, constants, MAL→bridge vocabulary map · **4b** `normalizeLookupQuery`, `meetsMinimumQueryLength`, `rankCandidates` |
| 5 — modal + hook + states | 570-760 | **5a** `use-anime-metadata-lookup.ts` + its `renderHook` suite (buildable and testable with no UI — that is what the strict hook anatomy buys) · **5b** modal, candidate, three states, layout fixture |

Slice 1 sits at its band's top (~410-575 after D11's removal) and should be watched, not pre-split.
Slices 3, 6, 7 and 8 fit. That yields **eleven work units**.

## Field Mapping (the exact transform)

| MAL | → bridge field | Transform |
|---|---|---|
| title heading | `name` | trimmed text (see D10) |
| `Type:` | `kind` | `TV`→`'0'`, `Movie`→`'1'`, `Special`→`'2'`, `OVA`→`'3'`. `ONA`, `Music`, anything else → leave `ANIME_CREATE_DEFAULT_KIND`, push `kind` to `unfilled`. **Never file an ONA as TV.** |
| `Status:` | — | presence only; value discarded (D2) |
| `Episodes:` | `totalEpisodes` | digits → string; literal `Unknown` → unfilled; other shape → `DriftError` |
| `Duration:` | `duration` (minutes) | `parseDurationMinutes` (D2a). `1 hr. 46 min.` → **`106`**, never `1`; unrecognized shape → `DriftError`, never `0` |
| `Source:` | `origin` | anchor text when linked, else bare text; `TrimSpace` (trap #3 newline padding) |
| `Studios:`/`Studio:` | `studios` | anchor texts joined `', '`; MAL's "add some" placeholder → unfilled (exact literal pinned from a fixture, not asserted here) |
| `Genres:`/`Genre:` | `genres` | anchor texts joined `', '` |
| `prefix.json` `image` | `coverPath` + `coverType:'url'` | taken from the **search** payload — no extra fetch. Covers resolve at display time (`cover/resolver.go`), so storing a URL costs nothing. |
| — | `page`, `folder`, `episodesWatched`/`progress`, `status`, `premieredAt` | **never written** |

**`premieredAt` is CLOSED, not open.** It is not autofilled anywhere: `anime-create.types.ts:4-9`
documents premiere date as *"an auto lifecycle field, never user input"*, and MAL supplies a
**season** (`Fall 2022`), not a date — writing it would require inventing a day. `Premiered:` is
therefore left **unparsed**, consistent with `Themes:`/`Demographic:`, rather than
parsed-and-discarded.

## Data Flow

```
AnimeCreateRow / AnimeEditorFormPanel
  └─ "Fetch metadata" (onPress; disabled while name is empty; OUTSIDE the optional-metadata
     disclosure, which spec.md:84-95 requires to open no modal)
       └─ AnimeMetadataLookupModal
            ├─ seed query from Name (first open only, hasSeededRef)
            ├─ onChange ──debounce 300ms──▶ runSearch
            │     ├─ below script-aware floor → idle · cache hit → resolved, NO request
            │     └─ seq = ++requestSeq ─▶ SearchMyAnimeList ─▶ myanimelist.Search
            │            │                                        └─ GET /search/prefix.json
            │            └─ on resolve: seq !== requestSeq ? DROP : apply
            ├─ rankCandidates(query)            ← order only, never correctness
            └─ user confirms ONE candidate
                 └─ GetMyAnimeListDetail(malID) ─▶ myanimelist.Detail
                      └─ GET /anime/{id}         ← the first and ONLY page fetch
                           └─ anchors {title, Type:, Status:} → miss ⇒ *DriftError, abort all
                              mapped fields      → value | Unfilled[]
                 └─ toAnimeMetadataSelection()   (shared: MAL vocab → bridge vocab)
                      └─ toCreateRowPatch / toEditorDraftPatch   (feature-owned)
                           └─ onRowChange(draftId, patch)  +  previous = pre-image(patch keys)
                                └─ Undo · unfilled report
```

## File Changes

| File | Action | Slice |
|---|---|---|
| `go.mod` | Modify — **one line**: `golang.org/x/net v0.56.0` moves from the indirect block to a direct `require`. **`go.sum` does not change** (D1) | 1 |
| `internal/myanimelist/types.go` | Create — `Candidate`, `Detail`, `SearchResult{Candidates}` (D11) | 1 |
| `internal/myanimelist/errors.go` | Create — `DriftError{Anchor,URL}`, `ErrNotFound`, status/transport sentinels | 1 |
| `internal/myanimelist/client.go` | Create — port `Fetcher`, adapter `httpClient`, `NewHTTPClient(timeout, maxBytes)` | 1 |
| `internal/myanimelist/search.go` | Create — `prefix.json`, `url.QueryEscape`, **exactly one request per query** | 1 |
| `internal/myanimelist/testdata/search_*.json` | Create — pinned payloads incl. a typo query and a zero-hit query | 1 |
| `internal/myanimelist/parse.go` | Create — locator lists, label sets, `parseDurationMinutes`, traps #1-#5 | 2a |
| `internal/myanimelist/detail.go` | Create — page fetch, anchor gate, `Unfilled` assembly | 2b |
| `internal/myanimelist/testdata/detail_*.html` | Create — TV/single-genre/ONA/movie + one doctored drift page | 2a/2b |
| `internal/api/contracts/myanimelist.go` | Create — result DTOs | 3 |
| `internal/desktop/app_myanimelist.go` | Create — the two bindings + domain→DTO | 3 |
| `.golangci.yml` | Modify — `myanimelist-speaks-only-mal` depguard rule (D5) | 3 |
| `frontend/src/shared/metadata-lookup/metadata-lookup.{types,constants}.ts` | Create — shapes + the two length floors + tipo map | 4a |
| `frontend/src/shared/metadata-lookup/metadata-lookup.helpers.ts` | Create — normalize, `meetsMinimumQueryLength` (D7a), `rankCandidates` | 4b |
| `frontend/…/AnimeMetadataLookupModal/use-anime-metadata-lookup.ts` | Create — debounce, newest-wins, cache | 5a |
| `frontend/…/AnimeMetadataLookupModal/*.tsx` + constants | Create — modal, candidate, three states | 5b |
| `frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx` | Modify — measure candidate placeholder vs real row | 5b |
| `frontend/…/AnimeCreate/AnimeCreateRow.tsx` | Modify — button outside the disclosure | 6 |
| `frontend/…/AnimeCreate/anime-create-metadata.helpers.ts` | Create — hop two + `buildUndoPatch` | 6 |
| `frontend/…/AnimeCreate/use-anime-create-rows.ts` | Modify — applied/undo state | 6 |
| `frontend/…/AnimeEditorWorkspace/AnimeEditorFormPanel.tsx` | Modify — button beside Name | 7 |
| `frontend/…/AnimeEditorWorkspace/anime-editor-metadata.helpers.ts` | Create — hop two | 7 |
| `frontend/…/AnimeEditorWorkspace/use-anime-editor-record.ts` | Modify — applied/undo state | 7 |
| `docs/adr/022-myanimelist-metadata-source.md` | Create — D1, D2, D5 | 8 |
| `.claude/skills/autoreas-theme/SKILL.md` | Modify — if a new convention lands | 8 |
| `docs/openapi.yaml` | **No change** — Wails bindings, desktop-only | — |

Colocated tests accompany every slice. `internal/myanimelist/live_test.go` (D3) lands with slice 2b.

## Interfaces

```go
// internal/myanimelist — MAL's vocabulary only. Imports nothing from internal/anime.
type Fetcher interface {
    Fetch(ctx context.Context, url string) (body []byte, err error)
}

func NewHTTPClient(timeout time.Duration, maxBytes int64) *httpClient

type Client struct{ /* fetch Fetcher; baseURL string */ }
func (c *Client) Search(ctx context.Context, query string) (SearchResult, error)
func (c *Client) Detail(ctx context.Context, malID int) (Detail, error)

type Detail struct {
    Title, Type, Episodes, Duration, Source string
    Studios, Genres []string
    Unfilled []string // labels that were legitimately absent
}

type DriftError struct{ Anchor, URL string } // errors.As-friendly
```

`Detail`'s URL is built as `fmt.Sprintf("%s/anime/%d", base, malID)` — an `int` cannot inject a path
segment, which is why the slug from the search payload is **not** accepted.

```ts
/** Normalized, source-agnostic result of one confirmed lookup. Knows no feature type. */
export interface AnimeMetadataSelection {
  readonly name: string;
  readonly kind?: string;
  readonly totalEpisodes?: string;
  readonly duration?: string;
  readonly origin?: string;
  readonly genres?: string;
  readonly studios?: string;
  readonly coverURL?: string;
  readonly unfilled: readonly string[];
}
```

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit (Go) | **`parseDurationMinutes` against every row of D2a's table, asserting the literal `106` for `1 hr. 46 min.`**; `Genre:`/`Genres:`; `Source:` linked vs bare vs newline-padded; `ONA` → unmapped + unfilled; `Episodes: Unknown` → unfilled | Table-driven over pinned `testdata/` |
| Integration (Go) | Full `Search` and `Detail` over `httptest.Server` serving the fixtures, so the real `NewHTTPClient` path (status check, `LimitReader`) runs; **a doctored page with `Type:` removed returns `DriftError{Anchor:"Type:"}` and zero fields**; a zero-hit query issues **exactly one** request (counted on the test server) | `httptest`, mirroring `cover/http_fetcher_test.go` |
| Guard (Go) | `golangci-lint run` fails on a deliberate `internal/anime` import from the MAL package | D5 depguard rule |
| Live (opt-in) | Anchors still present on a real page; **no value assertions** | `MYANIMELIST_LIVE=1`, skipped otherwise (D3) |
| Unit (frontend) | All eight rows of D7a's table through `meetsMinimumQueryLength`, incl. `銀魂`/`ナル` passing and `bl` failing; `rankCandidates` order for the measured typo case; `TV/Movie/Special/OVA` map, `ONA` does not; `buildUndoPatch` touches exactly the patch's keys | Vitest, table-driven |
| Hook (frontend) | A stale response resolving **after** a newer one is dropped; cache hit issues no request; sub-floor query issues no request; debounce coalesces | `renderHook` + fake timers + injected fake source |
| Render (frontend) | Three states, each asserting the **negative** (no candidate while loading); `getByRole('status', {name})`; the empty state names the query and invites a refinement, with **no action button** (D11); the button is **not** inside the optional-metadata disclosure | Testing Library |
| Layout | Candidate placeholder height == real candidate height | `loading-skeletons-fixture.tsx`, headless Edge |
| Mutation | `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/myanimelist/"` (then `./internal/desktop/`); `test:mutation:staged` for the frontend | Per the repo MUTATE step |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. Four trust notes on the new outbound boundary, none needing a new
mechanism:

1. **Untrusted third-party HTML is never rendered.** It becomes strings, then form field *values*,
   rendered as React text children. No `dangerouslySetInnerHTML` anywhere in this change.
2. **Body caps** via `io.LimitReader` on both endpoints; truncation surfaces as a missing anchor
   (D2), not as silent partial data.
3. **`coverPath`** flows into the existing cover resolver, which already fetches arbitrary URLs under
   a size cap and an `image/` MIME check (`cover/resolver.go:89-105`).
4. **No path or query injection**: `url.QueryEscape` on the search keyword, `%d` on the detail ID.

**User-Agent:** an honest `autoreas-bridge/<version>` string, not a browser impersonation. Explore
§ 2.4 measured a plain app UA returning `200`, so impersonation buys nothing, and an attributable UA
is the only thing that leaves the site owner able to identify the traffic — which matters given the
recorded terms-of-use position.

## Migration / Rollout

No migration, no schema, no `formatVersion`. Genres and studios already live inside `snapshot_json`
(`internal/sync/schema.go:27-36`). Nothing records that autofill ran — the values are
indistinguishable from typed ones — so revert is a plain code revert.

## Sizing (measured, per CLAUDE.md § 22)

Every figure below is `wc -l` on a real file in this tree, not an estimate by eye.

| Comparable | Measured |
|---|---|
| `internal/anime/cover/` (8 files) | 927 total — `http_fetcher.go` 68, `types.go` 70, `resolver.go` 106, `resolver_test.go` 287, `http_fetcher_test.go` 152 |
| `internal/download/sites/jkanime/` | `search.go` 92, `search_test.go` 100, `jkanime_test.go` 305, `testdata/buscar_dr_stone.html` **671** |
| `frontend/src/shared/ordering/` (16 files) | 2603 total — `ordering.helpers.ts` 230, its test 341, `use-anime-schedule-ordering.ts` 89, its test 369, `AnimeScheduleOrdering.tsx` 167, `AnimeScheduleOrderingCard.tsx` 58 |
| `RateAnimeModal/` (8 files) | 228 total — `.tsx` 56, hook 24, helpers 22 (a *simple* modal; this one searches) |
| `anime-create/ui/AnimeCreate/` (13 files) | 1359 total — `helpers.ts` 283, its test 150, `AnimeCreateRow.tsx` 118, `use-anime-create.ts` 109 |

Derived bands, tests included at the ~55% the repo measures:

| Block | Production | Tests | Total |
|---|---|---|---|
| Go module (slices 1-2) | 510-690 | 450-600 | 960-1290 |
| Bindings + DTO + depguard (3) | 120-160 | 120-180 | 240-340 |
| Shared module, no UI (4) | 205-275 | 250-350 | 455-625 |
| Modal + hook + states (5) | 270-360 | 300-400 | 570-760 |
| create wiring (6) | 95-115 | 180-220 | 275-335 |
| editor wiring (7) | 95-115 | 180-220 | 275-335 |
| ADR + docs (8) | 160-250 | — | 160-250 |
| **Total (authored, excl. HTML fixtures)** | | | **≈2,935-3,935** |

Add 40-80 lines of artifact prose per slice (AGENTS.md measured `tasks.md` edits at that band).

Dropping the zero-result retry (D11) takes roughly 30 production plus 40 test lines out of slice 1 —
real, but inside the band's own width, so the figures above are left as measured rather than
re-derived around a change smaller than their uncertainty.

**HTML fixtures are the sizing hazard.** A MAL anime page far exceeds jkanime's 671-line fixture, and
`git diff --stat` counts every line even though a scraped page is not authored text. Mitigation:
each fixture is trimmed to the title heading plus the information block — still a byte-for-byte
excerpt — with a header comment recording the source URL, the capture date, and what was removed.

**`400-line budget risk: High` against a PR budget — but the PR is not the unit here.** Per D12,
`size:exception` is accepted at the branch level and the binding constraint is ~600 changed lines per
**commit**. Against that unit the risk is **Medium**: eight slices, of which three (2, 4, 5) exceed
the band and are subdivided in D12 into eleven work units. `sdd-tasks` still owns the formal
forecast and its guard lines.

## Open Questions

- [ ] **Which fields carry `itemprop` microdata** is not enumerated anywhere in the evidence. Read
      off the pinned fixtures in slice 2a. The ordered-locator design makes this data, not rework.

Three questions previously listed here are now **settled** and recorded as decisions: non-Latin input
is measured (D7a), field-level undo is confirmed in scope (D9), and the delivery unit is the commit
under an accepted branch-level `size:exception` (D12).
