# Verify Report — Loading Skeletons

### Verdict

PASS

Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3). Phases 1–3 were
implemented by a delegated apply agent; Phase 4 — the layout proof, the gates, and this report — was
done here.

## Spec coverage

| Requirement | Where it is proved |
|---|---|
| Shape-mirroring placeholders, never a bare loading sentence | Per-surface placeholder-count tests over `catalog-skeleton-row`, `anime-editor-skeleton-row` and `episode-schedule-skeleton-row`; the three former text assertions no longer have any visible text to find |
| More than one placeholder row per surface | `MIN_PLACEHOLDER_ROWS` check in the layout fixture, plus the exact-count unit tests (4 / 6 / 3) |
| Placeholders disappear once resolved | Resolved-branch tests on all three surfaces assert no placeholder and no status region |
| Loading is announced, not merely drawn | `getByRole('status', { name })` on each surface, and a dumped-DOM count of `role="status"` on the running dev server |
| The status region does not outlive the request | Resolved- and error-branch assertions per surface |
| Catalog keeps the announcement it already had | Catalog's loading test asserts `role="status"` after the `<Spinner>` was removed — the assertion that makes the regression impossible to ship silently |
| Placeholder height matches the real row | `scripts/layout-fixtures/loading-skeletons-fixture.tsx`, measured in headless Edge at both viewports |

## The accessibility finding that changed the design

The design's original status-region snippet named the region from its content:

```tsx
<div aria-live="polite" role="status"><span className="sr-only">{LABEL}</span>…</div>
```

That computes an accessible name of `""`. `role="status"` takes its name from the author, not from
its contents — the ARIA name-from-content allowlist covers roles like button, link, heading and tab,
and `status` is not among them. The RED test on Catalog caught it before any of it shipped, which is
what writing the failing test first is for. All three surfaces now use `aria-labelledby` pointing at
the `sr-only` span, so the region has both a real name and real text for a live region to announce.
`design.md` was corrected at the source so the broken snippet cannot be copied again.

A second finding, verified rather than assumed: HeroUI's `<Spinner>` already ships `role="status"` and
`aria-label="Loading"` (`@heroui/react/dist/components/spinner/spinner.js:74,76`). Catalog was
therefore the *most* accessible of the three surfaces before this change, not the least, and removing
its spinner without providing a replacement region would have been a real regression rather than a
theoretical one.

## The layout gate can fail

The no-layout-shift check was proved capable of failing before it was accepted as green. Raising one
Catalog placeholder bar from `h-4` to `h-12` produced:

```
FAIL catalog: the placeholder is the height of the row it replaces
     — placeholder 102px vs row 74px, drift 28px, tolerance 6px
```

Reverting restored green. This step exists because the previous change shipped a layout fixture that
measured presence and containment and could not fail on a 512px illustration filling the panel.

Measured drift, at both viewports:

| Surface | Placeholder | Real row | Drift |
|---|---|---|---|
| Today | 128px | 128px | 0px |
| Editor Library | 56px | 58px | 2px |
| Catalog | 70px | 74px | 4px |

Tolerance is 6px. Making the tolerance wide enough to hide a shifted row would have defeated the
check, so it is set just above the widest honest drift.

## Gates (run by the orchestrator, actual output)

| Gate | Result |
|---|---|
| `bun --cwd=frontend run test` | 267 files / **2425 tests** passed (2417 before) |
| `bun --cwd=frontend run typecheck` | Clean |
| `bunx eslint <staged>` | 0 problems |
| `fallow audit --gate new-only` (changed code) | **exit 0** after one complexity finding was paid down |
| `bun --cwd=frontend run layout:smoke` | Green at 1280×900 and 1600×1000, with 9 new checks |
| `bun --cwd=frontend run render:smoke` | Green on all six routes |
| `bun --cwd=frontend run test:mutation:staged` | **83.67** against a break threshold of 80 |
| `lefthook run pre-commit` | Green, exit 0 |

Every Go job skipped: this change stages no `.go` file.

## MUTATE step (CLAUDE.md #16)

The first staged run scored 83.22 and left three survivors on the newly extracted `CatalogListRow`:

```
- color={item.status === 'active' ? 'success' : 'default'}
+ color={true ? … }  /  false ? …  /  item.status !== 'active' ? …
```

The chip's colour is the only thing separating an active from an inactive anime at a glance, and no
test asserted it — extracting the row made that pre-existing gap this change's to close. HeroUI
publishes the colour as a BEM class, so asserting `chip--success` and `chip--default` tests the
component's documented contract rather than an incidental utility class. `CatalogListRow` went to
**100%** mutation coverage and the overall score to 83.67.

Note on a technique rather than the code: the `git diff --quiet` guard recommended for proving a
`perl -0pi` edit applied reports "did not apply" for **untracked** files, because it compares against
the index. During the deliberate-break step it said the mutation had not applied while the smoke
output proved it had. For a new file, the measurement is the proof, not the diff.

## Runtime validation beyond the gate (CLAUDE.md 18b)

Loading states are transient, but with no Wails runtime present `waitForBindings` holds them for five
seconds, so a short virtual-time budget captures them:

| Check | Result |
|---|---|
| `/#/today` at `--virtual-time-budget=2500` | Three card-shaped placeholders: cover block, title bar with chip pill, subtitle bar, three action squares |
| `/#/catalog` | Four row placeholders: title and subtitle bars with two chip pills, inside the real row's border |
| `/#/editor` | Six two-line rail placeholders |
| Dumped DOM, all three routes | `role="status"` present exactly once per surface while loading |

## Deferred, not dropped

`AnimeDetail`, `SoloAnimeDownloadPanel` and `SyncingAnimePanel` still show text loading states.
`ActivityOverview`, `NetworkPanel` and `TransactionPanel` need skeleton `Table.Row`s and a redesign of
the `isLoading ? LOADING : EMPTY` helper feeding `renderEmptyState`. The seven near-identical
`<section aria-label="Loading X"><Skeleton/></section>` sites remain a legitimate future extraction.
