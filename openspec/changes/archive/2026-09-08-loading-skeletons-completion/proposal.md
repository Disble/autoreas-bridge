# Proposal: Loading Skeletons Completion

## Intent

Finish what `loading-skeletons` started: no surface in the app answers an unresolved request with a
sentence, and no skeleton draws itself without announcing what is loading. Then make the rule
mandatory in the design-system skill so the next surface starts correct instead of being caught in
review.

## Scope

### In Scope

Three groups, plus the rule that stops the fourth from happening.

**Group A — the surfaces still showing text.** `AnimeDetail`, `SoloAnimeDownloadPanel` and
`SyncingAnimePanel` get placeholders mirroring the content that replaces them.

**Group B — the tables.** `NetworkTable`, `TransactionTable` and the two `ActivityOverview` tables
put their loading text in `Table.Body`'s `renderEmptyState` slot. They get skeleton `Table.Row`s
instead, which is better than the pre-table branch `HistoryTable` uses: the header and column widths
stay put and the rows swap in place, so the table does not resize when data arrives.

**Group C — the announcement gap on already-shipped skeletons.** Seven sites
(`HosterPriorityEditor`, `RunHistoryPanel`, `EpisodeRenamePanel`, `SchedulePanel`, `JDLimitsPanel`,
`JDConfigPanel`, `SeasonWorkspace`) already render skeleton bars but announce only through a static
`aria-label` on a `<section>`, which a screen reader surfaces on landmark navigation rather than when
the loading starts. They are also seven copies of the same markup. One shared `LoadingBars` in
`shared/ui/` carries both the bars and the status region, so the duplication and the gap close
together. `HistoryTable` adopts it too, which moves its currently visible label into the accessible
layer like every other surface.

**Group D — the rule.** `.claude/skills/autoreas-theme/SKILL.md` gains a mandatory loading-state
section: a resolved-empty state uses `AirisEmptyState`, an unresolved one uses a shape-mirroring
skeleton inside a named status region, and a bare sentence or a lone spinner is not an acceptable
loading state.

### Out of Scope

Nothing deferred this time. After this change every loading branch in `frontend/src` is either a
shape-mirroring skeleton or `LoadingBars`, and every one of them announces.

## Approach

Group C's shared component is not a reversal of the previous change's decision to avoid a shared
skeleton. That decision was about three surfaces whose row shapes genuinely differ; these seven are
byte-for-byte the same markup with a different bar count. The repo's extraction bar is the same
pattern three times, and this is that pattern seven times.

The status region keeps the shape the previous change had to discover the hard way:
`role="status"` with `aria-labelledby` pointing at an `sr-only` span, because `status` takes its
accessible name from the author and not from its contents. Tables cannot nest that region inside the
table markup, so they place a visually hidden status region as a sibling of the table and mark the
table `aria-busy` while loading.

## Why Now

The three surfaces the user first pointed at are done and consistent. Leaving nine others on text,
spinners, or silent skeletons makes the app inconsistent in a way that reads as unfinished, and every
new surface copied from a neighbour inherits whichever version it happened to copy. The skill rule is
what makes this the last time.

## Risks

| Risk | Response |
|---|---|
| Adopting `LoadingBars` changes `HistoryTable`'s visible label to a screen-reader-only one | Deliberate and asserted: its test becomes a role-and-name query, and the skeleton remains the visible signal |
| Skeleton `Table.Row`s could desync from real column widths | The layout fixture measures a skeleton row against a real row per table |
| Nine surfaces at once is a large diff | Split into work units with independent test commands; the units are the review boundaries |
| A skill rule nobody reads changes nothing | The rule states the two components by name and the exact status-region markup, so following it is copy-paste and breaking it is visible in review |

## Success Criteria

- `grep` finds no loading sentence rendered as the only loading feedback anywhere in `frontend/src`.
- Every loading branch exposes `role="status"` naming what is loading, and drops it once settled.
- Skeleton table rows match real row height within tolerance, measured in a real browser.
- `autoreas-theme` states the loading rule as mandatory, with the markup to copy.
- The full pre-commit gate passes, including the staged mutation threshold.
