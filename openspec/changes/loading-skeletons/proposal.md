# Proposal: Loading Skeletons

## Intent

Replace the last three text-only loading states — Today, the Editor Library and Catalog — with
skeletons that mirror the shape of the rows about to arrive, without losing the announcement a screen
reader depends on and without letting the content jump when the request resolves.

## Scope

### In Scope

- Today (`EpisodeSchedulePanel`): a skeleton mirroring `EpisodeScheduleCard` — cover slot, name and
  progress lines, action affordances.
- Editor Library (`AnimeEditorListPanel`): a skeleton mirroring the two-line rail row.
- Catalog (`CatalogPanel`): a skeleton mirroring the `<li>` row — title, progress subtitle, status
  chips.
- One `role="status"` live region per surface, carrying the loading wording that is currently visible
  text as its accessible name.
- A layout-fixture guard proving each skeleton row occupies the same vertical footprint as the real
  row it stands in for.

### Out of Scope

Deferred, not dropped:

- `AnimeDetail`, `SoloAnimeDownloadPanel` and `SyncingAnimePanel` — real remaining text loading
  states, simply not the ones asked for.
- `ActivityOverview`, `NetworkPanel` and `TransactionPanel` — their loading text is produced by one
  `isLoading ? LOADING : EMPTY` helper feeding `Table.Body`'s `renderEmptyState` slot. Converting them
  needs skeleton `Table.Row`s and a redesign of that helper, which is its own change.
- Extracting the seven near-identical `<section aria-label="Loading X"><Skeleton/></section>` call
  sites into a shared `LoadingBars`. That is duplication worth removing, but it is a refactor of
  already-shipped, already-adequate code.

## Approach

Per-feature skeleton components, colocated with the panel they mirror, composing HeroUI's bare
`Skeleton` directly. No new `shared/ui` abstraction: the three shapes differ from each other, none of
the nine existing `Skeleton` call sites uses a wrapper, and the repo's extraction bar is the same
pattern three times, not three patterns once.

Two decisions carry the quality of this change, and both are enforced rather than described:

**The loading wording moves to the accessible layer instead of disappearing.** Each skeleton sits in a
`role="status"` region whose accessible name is the string that used to be visible. Today and the
Editor Library gain an announcement they never had; Catalog keeps the one its `<Spinner>` already
provided (`role="status"`, `aria-label="Loading"`, verified in the installed package). The existing
tests that assert on the visible text become `getByRole('status', { name })` assertions, which prove
more than they did before.

**A skeleton that shifts the layout is worse than the text it replaced.** Preventing the jump when
content arrives is the entire reason a skeleton beats a spinner, so the layout fixture measures the
skeleton row against the real row and fails when they differ beyond a stated tolerance.

## Why Now

The three surfaces just received their empty states in the archived `airis-empty-states` change. Their
loading states are the other half of the same story, and leaving them as bare sentences next to a
composed empty state is the visible inconsistency that prompted this work.

## Risks

| Risk | Response |
|---|---|
| Losing the screen-reader announcement | A normative requirement, not a note: every converted surface exposes `role="status"` with the loading wording as its accessible name, asserted per surface |
| Layout shift on resolve | A real-browser measurement comparing skeleton and real row heights, at both fixture viewports |
| Three tests assert the deleted text | Rewritten first, under strict TDD, as role-and-name assertions |
| Skeleton row counts are new logic | Covered by DOM-count tests and a staged mutation pass |

## Success Criteria

- No surface in scope renders a bare loading sentence.
- Each exposes `role="status"` while loading, named by its loading wording, and neither the status
  region nor any skeleton remains once the request resolves.
- Skeleton row height matches the real row height within tolerance, measured in headless Edge.
- The full pre-commit gate passes, including the staged mutation threshold.
