# Archive Report: 2026-09-12-sdd-70-mal-metadata

**Archived**: 2026-09-12
**Change**: MyAnimeList Metadata Autofill (SDD-70)
**Status**: Complete and verified
**Mode**: openspec

## Executive Summary

MyAnimeList metadata autofill has been successfully implemented, verified, and archived. The change adds a two-stage metadata retrieval module (`internal/myanimelist/`), provides a confirm-first lookup modal for both Create and Edit forms, and applies only the mapped, form-owned fields from MAL's vocabulary to the anime draft. All 136 tasks completed across eleven implementation slices; verification PASS; all requirements proved with comprehensive test coverage including mutation testing, the mandatory packaged-app verification obligation proving a typo'd name surfaces the correct anime, live optional-field reporting on missing data, and structural proof that the lookup modal is the sole permitted nested dialog inside the Create tab.

## Specs Synced

### MyAnimeList Metadata Source (New)

| Domain | Action | Details |
|--------|--------|---------|
| myanimelist-metadata-source | Created | New capability: two-stage retrieval (search returns candidates without fetching details), required-anchor parsing aborts loudly with named errors, optional fields degrade visibly, genre label handles singular/plural forms, duration parsing recognizes known shapes with table-driven validation, module boundary isolation enforced |

**Requirements added**: 6 requirements (`Two-stage retrieval gates the detail fetch on confirmation`, `Required-anchor parsing aborts loudly; optional fields degrade visibly`, `Genre label matches both singular and plural forms`, `Duration parsing recognizes known shapes, rejects unknown ones as drift`, `Source label handles anchor text, bare text, and padding`, `Module boundary isolation`) with 13 total scenarios proving MAL vocabulary preservation, error contract, fixture-backed parsing, and import isolation.

### Anime Metadata Autofill (New)

| Domain | Action | Details |
|--------|--------|---------|
| anime-metadata-autofill | Created | New capability: Fetch-metadata action on Create row and Edit form (disabled until Name is present), confirm-first lookup modal with debounce and stale-response dropping, three exclusive UI states (loading skeleton, empty state, error Alert), local re-scoring for presentation order only, detail fetch and form writes gated on explicit confirmation, MAL-to-form mapping applies only mapped form-owned fields, never-touched field set (Download page, Folder, Watched episodes, watching estado, premiere date), unfilled optional fields reported to user |

**Requirements added**: 8 requirements defining the lookup modal behavior, candidate list states, form writes, field mappings, and protected field preservation with 16 total scenarios proving user confirmation gates all writes, mapping trap prevention (MAL Status ≠ watching estado), single-genre parsing, and ONA unmapping.

### Anime Create Editor (Modified)

| Domain | Action | Details |
|--------|--------|---------|
| anime-create-editor | Modified | Requirement narrowed and expanded: "No modal-over-modal, no chip inputs" → "No modal-over-modal, no chip inputs, one transient lookup exception" to permit exactly one user-invoked, transient metadata lookup modal kept outside the optional-metadata disclosure |

**Requirements modified**: 1 requirement narrowed and updated:
- "No modal-over-modal, no chip inputs, one transient lookup exception" (formerly "No modal-over-modal, no chip inputs") — requirement text expanded to name the exception and its placement constraints; four scenarios:
  - "Optional metadata disclosure stays inline" — unchanged, reasserted in context of the new exception
  - "Fetch-metadata lookup is the sole permitted nested dialog" (new) — names the exception explicitly as the only permitted modal
  - "Fetch-metadata action stays outside the optional-metadata disclosure" (new) — enforces placement independence
  - "Closing the lookup modal returns to the inline tab layout" (new) — proves the modal is transient

**Narrowing rationale documented**: Parenthetical note in delta spec clarifies that the prohibition's intent (no modal-over-modal for Create surface, no chip inputs, inline optional-metadata) is preserved while exactly one transient, user-invoked lookup dialog is now permitted, kept outside the disclosure.

## Archive Contents

| Artifact | Status | Details |
|----------|--------|---------|
| proposal.md | ✅ Complete | MyAnimeList metadata autofill intent (typo tolerance from MAL's autocomplete), scope (two new capabilities, one delta, module isolation, confirm-first UX, MAL → bridge mapping outside the module), approach (isolated Go module, two-stage retrieval, noisy errors on drift, frontend modal with three exclusive states), risks (scraping ToS acceptance, markup drift, stale results, non-Latin probing), rollback plan (revert, no schema involved), sizing (eight design slices pre-split into eleven work units) |
| design.md | ✅ Complete | Technical approach: Go HTML parser with required-anchor gate, optional-field unfilled reporting, detail fetch gated on user confirmation, modal design with three exclusive states, debounce/newest-wins/cache strategy, local re-ranking by Levenshtein distance, field mapping trap prevention (MAL Status structurally excluded from bridge vocabulary) |
| tasks.md | ✅ Complete | 11 work units (Slices 1-8) with 136 tasks total (all marked complete with `[x]`) — Go foundation (types/errors/client/search), parser (locators/duration/episodes), detail fetch (anchor gate/unfilled reporting/integration), Wails bindings, shared types/constants/mapping, query helpers (normalization/min-length/re-rank), hook (debounce/newest-wins/cache/seeded pre-fill), modal (three states/candidate card/placement), Create wiring, Editor wiring, documentation/ADR/changelog; note: per-slice commits marked SUPERSEDED because `checksdd` requires complete change for `git commit`, structural impossibility in this repo, work unaffected |
| verify-report.md | ✅ Complete | Verification PASS; `go build`, `go vet`, `go test ./...` all clean; `go run ./tools/checkgofmt`, `checkgofilesize`, `checkarchitecture`, `checkopenapi` all passed; both golangci-lint profiles 0 issues; `bun --cwd="frontend" run typecheck` clean; 308 frontend test files / 2818 tests passed; `bun --cwd="frontend" run render:smoke` production bundle renders every checked route; `bun --cwd="frontend" run layout:smoke` 212 assertions passing; `git diff --stat -- docs/openapi.yaml` empty (desktop-only Wails bindings); mutation testing with per-file measurements (Slice 1 1.00, 2a 0.92, 2b 0.93, 3 0.86, 4b 0.83, 5b 0.92, 6 1.00, metadata-lookup-source 1.00); requirement coverage verified including typo'd name surfaces correct anime, single-genre parsing, duration parsing, missing anchor aborts with typed error, ONA never filed as TV, MAL Status never reaches watching estado, never-touched set holds (five fields), lookup trigger outside disclosure, three UI states exclusive; mandatory packaged-app verification obligation: typo search and confirmation cycle proved live |
| specs/myanimelist-metadata-source/spec.md | ✅ Complete | 6 requirements defining two-stage retrieval, required-anchor contract, genre label handling, duration parsing, source extraction, module isolation with 13 total scenarios |
| specs/anime-metadata-autofill/spec.md | ✅ Complete | 8 requirements defining action availability, lookup modal search, three exclusive candidate states, local re-scoring, confirmation gate, MAL-to-form mapping (including trap prevention), never-touched fields, unfilled reporting with 16 total scenarios |
| specs/anime-create-editor/spec.md | ✅ Complete | 6 requirements including the updated "No modal-over-modal, no chip inputs, one transient lookup exception" (formerly 5 requirements with the original constraint); four scenarios added/updated to define the lookup modal exception, placement outside disclosure, and modal closure |

## Merge Validation

**Merge type**: Two new capabilities (myanimelist-metadata-source, anime-metadata-autofill) + one modified capability (anime-create-editor delta)

**Destructive risk**: None. Both new specs are placed under `openspec/specs/` in their own domains. The anime-create-editor delta modifies one existing requirement by:
- Expanding the heading from "No modal-over-modal, no chip inputs" to "No modal-over-modal, no chip inputs, one transient lookup exception" (clarifies scope, no removal)
- Adding three paragraphs to the requirement text defining the exception, its placement, and closure semantics
- Preserving the original scenario ("Optional metadata disclosure stays inline") unchanged
- Adding three new scenarios (fetch-metadata lookup exception, placement outside disclosure, modal closure)

**Merge outcomes**:
- `openspec/specs/myanimelist-metadata-source/spec.md` created as new capability (6 requirements, 13 scenarios)
- `openspec/specs/anime-metadata-autofill/spec.md` created as new capability (8 requirements, 16 scenarios)
- `openspec/specs/anime-create-editor/spec.md` updated with one modified requirement:
  - Requirement heading changed: "No modal-over-modal, no chip inputs" → "No modal-over-modal, no chip inputs, one transient lookup exception"
  - Requirement text expanded to define the exception, placement constraints, and closure behavior
  - Original scenario preserved; three new scenarios added
  - Parenthetical note documents the narrowing rationale
- No removals from existing requirements or scenarios
- Source of truth established for all three specs

## Implementation Summary

**Go + Frontend change**: 11 slices over 4,596+ total changed lines (production + tests, measured by verify-report as exceeding forecast):
- Slice 1: Go foundation (search client, typed errors, fixtures) — 410–575 lines forecast
- Slice 2a: Parser locators, duration table — ~280–370 lines (half of Slice 2)
- Slice 2b: Detail fetch, anchor gate, integration — ~280–360 lines
- Slice 3: Wails bindings, DTOs, isolation guard — 240–340 lines
- Slice 4a: Shared types, constants, MAL→bridge map — ~150–220 lines
- Slice 4b: Query normalize, min-length, local re-rank — ~305–405 lines
- Slice 5a: Debounce/newest-wins hook — ~260–340 lines
- Slice 5b: Modal, candidate card, three states, layout fixture — ~310–420 lines
- Slice 6: Create wiring — 275–335 lines
- Slice 7: Editor wiring — 275–335 lines
- Slice 8: ADR, docs, changelog — 160–250 lines

### Deliverables

- `internal/myanimelist/` module with typed `Candidate`, `SearchResult`, `Detail`, error contract (`DriftError`), HTML parsing via `golang.org/x/net/html`, fixture-backed tests
- `Client.Search()` returns candidates from `GET /search/prefix.json?type=anime&keyword=<q>&v=1` with no detail fetch
- `Client.Detail(id)` fetches `/anime/{id}` detail page with required-anchor gate (title, Type, Status) aborting on miss, optional fields degrading to `Unfilled` on absence
- Duration parser recognizes `N min. per ep.`, `H hr. M min.`, `H hr.`, `N min.` shapes; rejects unknown as drift error
- Genre label matches both `Genres:` (plural) and `Genre:` (singular) via label-set matching
- Source extraction prefers anchor text, falls back to bare text, trims whitespace
- Wails bindings (`SearchMyAnimeList`, `GetMyAnimeListDetail`) map outcome to `AnimePatchOutcome` enum
- Frontend `AnimeMetadataLookupModal` with three exclusive states (loading skeleton, empty state, error Alert), all rendered state assertions testing negatives
- Candidate card selection tracking with confirm button, modal closes on cancel or confirm without writing
- `use-anime-metadata-lookup.ts` hook with debounce (300 ms), minimum query length (2 code points for wide, 3 for Latin), stale-response dropping via request sequence counter, cache by normalized query, seeded pre-fill on first open only
- Local re-ranking by Levenshtein distance (presentation order only, never pre-select)
- Fetch-metadata action on Create row card (outside optional-metadata disclosure) and Edit form panel (beside Name), disabled until Name is present
- `AnimeMetadataSelection` type captures MAL vocabulary with unfilled optional-field set
- MAL→Create mapping: type (enum closed to TV/Movie/Special/OVA), genres, studios, duration, source, cover URL; never: download page, folder, episodes watched
- MAL→Editor mapping: same fields, never: download page, folder, episodes watched, watching estado, premiere date
- Mapping trap prevention: MAL's `Status:` (airing status) structurally excluded from `AnimeMetadataSelection`, never reaches form's watching estado
- ONA and Music media types left at default, reported as unfilled
- Applied patch + undo state with `AppliedMetadata<TPatch>` generic in shared module, re-derivation of folder on name change (auto-derivation channel unchanged)
- Depguard rule `myanimelist-speaks-only-mal` enforces `internal/myanimelist` imports nothing from `internal/anime`

### Gaps Found and Closed During Apply

Per verify-report § 5, two design elements had no owning task:
1. `toAnimeMetadataSelection` (MAL→bridge producer) — designed but not tasked — assigned to Slice 5b, implemented and wired
2. `rankCandidates` (presentation re-ranking) — built in Slice 4b, not consumed until wired in Slice 5b — found by fallow audit reporting unused export

### Defects Found and Fixed During Apply

Per verify-report § 6:
1. Feature called Wails binding directly (`use-anime-create-rows.ts` imported `wailsjs/go/desktop`), risking silent degradation before bindings attach — fixed by routing through new `infrastructure/metadata-lookup-source/` wrapper with `waitForBindings` and degraded-path test
2. Candidate row collapsed to 36px in headless Edge (image without CDN access) — fixed with explicit `width`/`height` attributes and `min-h-14` floor, guarded by layout fixture
3. Dead code proved by mutation testing (HeroUI `Modal` treats first `Button` as implicit trigger, explicit `onPress` unreachable) — deleted rather than tested
4. Real-page markup contradicted design (`itemprop="name"` wraps both title and subtitle) — design corrected to use first `<h1>` title only

### Planning Miss Reported, Not Trimmed

Slices ran 1.3×–3.5× over design forecast, totaling far more than 2,935–3,935 lines. Per CLAUDE.md § 22, no test was deleted to close the gap; remainder after genuine cleanup reported as planning miss. Slice 2 `client_test.go` refactored from 11 hand-copied functions to table test, saved 36 lines but pushed cognitive complexity past ceiling; splitting back by assertion mode spent lines again. Net: 1 line. **Mechanism retained**: cases differing in DATA compress into a table; cases differing in which ASSERTIONS RUN do not.

## Task Completion Gate

**Persisted tasks artifact**: `openspec/changes/archive/2026-09-12-sdd-70-mal-metadata/tasks.md`

**Status**: All 136 implementation tasks marked complete (`[x]`). No unchecked tasks remain. Per-slice commits marked SUPERSEDED rather than done because `tools/checksdd` globs on `*.go` and requires the complete change, making per-slice commits structurally impossible in this repository. The work completed and verified; the commit granularity conforms to repository constraints.

## Verification Summary

| Verification | Result |
|--------------|--------|
| Go test suite (`go test ./...`) | clean, all packages pass |
| Go vet / gofmt | clean |
| Frontend suite (`bun run test`) | **2818/2818 passed**, 308 files |
| golangci-lint | 0 issues, both profiles |
| Fallow audit | exit 0 |
| Go file size policy (`checkgofilesize`) | passed, baseline still empty |
| Frontend render smoke test (`render:smoke`) | production bundle paints on every checked route |
| Frontend layout smoke test (`layout:smoke`) | 212 assertions passing |
| OpenAPI surface (`git diff -- docs/openapi.yaml`) | empty — desktop-only Wails binding, no wire change |
| Mutation testing | Slice 1 1.00 (29/29); 2a 0.92; 2b 0.93; 3 0.86; 4b 0.83; 5b 0.92; 6 1.00 (touched production); metadata-lookup-source 1.00 (21/21); surviving mutants are genuine: `<= 0` treats `-1` identically to `0`; anchored regex with entirely optional content makes "both groups empty" and "whole match empty" the same proposition; private Levenshtein distance internals (design forbids asserting raw scores, only order) |
| Requirement coverage | All 27 total requirements (6 myanimelist-metadata-source + 8 anime-metadata-autofill + modified anime-create-editor) verified against running tree: typo'd name surfaces correct anime with local re-scoring first, no detail page fetched before confirmation, single-genre anime fills genre, missing required anchor returns typed DriftError, ONA never filed as TV, MAL Status never written to watching estado, five-field never-touched set holds, lookup trigger stays outside disclosure, three UI states exclusive |
| Packaged-app verification (full cycle obligation) | **PASS**, 2026-09-12, discharged by repository owner. Full cycle verified: typo'd search query surfaces correct anime in candidates, confirm fetches detail and applies only mapped fields, form fields never-touched list verified, undo restores previous state |

## Drift Recorded

Per CLAUDE.md § 2, deviations from canonical state recorded:

1. `.atl/` git-ignored, so `.atl/active-sdd-change` absent from fresh worktrees — requires manual recreation or workaround for `checksdd`'s `detectActiveChange` fallback that treats every non-`archive` directory as active when marker unset. This worktree carries the marker (verified present), so this change's commits unaffected. Risk for future worktrees recorded.

2. `bridge-testing` and `bridge-debugging` skills named by CLAUDE.md notes #5/#6 resolve to nothing — neither in repository nor global skills directory. Recorded in explore.md § 5.2, re-verified during this phase.

3. `checksdd`'s `detectActiveChange` fallback and legacy changes never relocated under `archive/` (37 non-archive directories exist today) make per-slice commits impossible: `checksdd` globs on `*.go` and requires complete change. Task breakdown's eleven per-slice commits marked SUPERSEDED; work unaffected, delivery shape conforms to repository constraints.

## SDD Cycle Closure

- **Proposal**: MyAnimeList metadata autofill — two-stage retrieval, confirm-first UX, MAL→bridge mapping outside module — ✅
- **Specs**: 6 new requirements (myanimelist-metadata-source) + 8 new requirements (anime-metadata-autofill) + 1 modified requirement (anime-create-editor delta) with 31 total scenarios — ✅
- **Design**: Isolated Go module, noisy-error contract, three-state modal, debounce/newest-wins/cache hook, mapping trap prevention, field guarding — ✅
- **Tasks**: 136 tasks across 11 slices (Go foundation/parsing/detail/bindings/shared/query helpers/hook/modal/Create/Editor/docs) — ✅ all complete
- **Implementation**: Go + Frontend, 11 slices, 4,596+ changed lines, gaps identified during apply and closed, four defects found and fixed, planning miss reported — ✅
- **Verification**: Test suites, Go vet, lint, file size policy, layout fixture proving placeholder/row height match, mutation testing with documented equivalents, packaged-app full-cycle PASS — ✅ PASS
- **Archive**: Specs synced (two new, one modified), change folder moved to archive, audit trail complete — ✅

**Verdict**: The change is fully planned, implemented, verified, and archived. Source of truth (openspec/specs/) reflects the two-stage retrieval contract, mapping trap prevention, and confirm-first autofill semantics. All proof obligations discharged.

---

## Traceability

**Change ID**: `2026-09-12-sdd-70-mal-metadata`
**Archive Date**: 2026-09-12
**Archived to**: `openspec/changes/archive/2026-09-12-sdd-70-mal-metadata/`
**Engram Topic Key**: `sdd/2026-09-12-sdd-70-mal-metadata/archive-report`
**Related Topic Keys**:
- `sdd/2026-09-12-sdd-70-mal-metadata/proposal`
- `sdd/2026-09-12-sdd-70-mal-metadata/spec`
- `sdd/2026-09-12-sdd-70-mal-metadata/design`
- `sdd/2026-09-12-sdd-70-mal-metadata/tasks`
- `sdd/2026-09-12-sdd-70-mal-metadata/verify-report`
