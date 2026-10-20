# Loading, empty and error — MANDATORY

Every surface that loads data answers each state with one component. A surface that shows a sentence
while it loads, or a lone spinner, is not finished.

| State | What to render |
|---|---|
| Request unresolved, nothing loaded yet | A skeleton **mirroring the shape of the content that will replace it**, inside a status region (or `LoadingBars`, `shared/ui/LoadingBars/`, for a stack of uniform bars) |
| Refetching while rows are already on screen | **The rows themselves**, `aria-busy`, and a discreet visible hint in the surface's own status line. No skeleton |
| Resolved, nothing to show | `AirisEmptyState` (see `empty-states.md`); a detail pane with nothing selected uses `AwaitingSelectionPane` |
| Request failed | The surface's error `Alert`. Never an empty state, never a skeleton |

## The states are EXCLUSIVE — the one that gets missed

The placeholder **replaces** the content; it is not a block added above it. Gate the content on the
request, never on the collection alone:

```tsx
{/* WRONG — both blocks render together on any reload that keeps prior data */}
{isLoading ? <XSkeleton /> : null}
<div>{rows.map(renderRow)}</div>

{/* WRONG for the same reason — `rows.length > 0` is true while reloading */}
{rows.length > 0 ? <div>{rows.map(renderRow)}</div> : null}

{/* RIGHT */}
{isLoading ? <XSkeleton /> : null}
<div>{isLoading ? null : rows.map(renderRow)}</div>
```

A refetching surface keeps its previous rows in state, so `isLoading` and `rows.length > 0` are both
true; on first mount they never are, so the bug hides until someone switches a filter, day or tab. It
shipped on three surfaces before a user screenshotted skeletons stacked on top of the real cards.

Nuance (2026-09-21, owner decision): "exclusive" bans a placeholder ON TOP OF real content; it does
not require a placeholder at all. A refetch with rows on screen keeps the rows, `aria-busy` and a
hint. The Activity rails use two flags: `isLoading` → skeleton, `isUpdating` → rows plus hint
(`TRANSACTION_UPDATING_STATE_MESSAGE` / `NETWORK_UPDATING_STATE_MESSAGE`).

## The status region — copy this exactly

```tsx
<div aria-labelledby="x-loading-label" aria-live="polite" role="status">
  <span className="sr-only" id="x-loading-label">{LOADING_LABEL}</span>
  {placeholder}
</div>
```

- The `sr-only` span is what the polite live region **announces**; a `Skeleton` contributes no text.
- **`aria-labelledby` is required.** `role="status"` takes its name from the author (ARIA's
  name-from-content allowlist excludes it), so a region named only by its contents computes `""` and
  `getByRole('status', { name })` fails. This cost a full RED → GREEN cycle; do not re-derive it.
- Tables cannot nest the region in table markup: put a visually hidden region **beside** the table
  and set `aria-busy` on the table while loading.

## Shape-mirroring

A skeleton beats a spinner only because the content does not jump when it arrives, so the
placeholder's **height** is a contract:

- Share ONE row-shape class between the real row and its placeholder (`CATALOG_LIST_ROW_CLASS`,
  `ANIME_EDITOR_LIST_ROW_CLASS`, `EPISODE_COVER_SLOT_CLASS`).
- A surface with more than one view draws the placeholder of the ACTIVE view. Catalog's
  `CatalogSkeleton` draws cover cards in the grid (sharing `CATALOG_GRID_CLASS` and
  `CATALOG_COVER_FRAME_CLASS` with `CatalogCard`) and 40px-cover rows in the list (sharing
  `CATALOG_LIST_ROW_CLASS` with `CatalogListRow`).
- Render more than one placeholder row for list and table content, from a named
  `*_SKELETON_ROW_COUNT` constant.
- **Tables: render the placeholder as a plain `<table>` INSTEAD of the React Aria `Table`, never as
  `Table.Row`s inside `Table.Body`.** Keep the header by rendering the placeholder's own `<th>`s from
  the SAME column descriptor module the real header maps over. Placeholders inside the collection
  wedge the renderer: React Aria's `useGridState` focus-fixup scan has no iteration bound, and a
  collection where every row is skippable (skeleton rows carry `isDisabled`; `disabledBehavior`
  defaults to `"all"`) makes it oscillate forever. That was the 2026-09-21 Activity freeze: one core
  pinned for 35+ minutes, memory at 2.8 GB, no error anywhere. References:
  `NetworkTableSkeleton` (`features/network/ui/NetworkTable/`) and `TransactionTableSkeleton`.
  - The placeholder row carries the real row's height (`h-9`, 36px on these rails; the fixture
    allows 6px of drift).
  - A placeholder `<th>` needs an explicit `role="columnheader"`: the fixture matches
    `[role="columnheader"]` by attribute selector, which an implicit role does not satisfy.
  - A pre-table loading branch (as `HistoryTable` once had) loses the header, so columns resize when
    data lands.
- Prove it: `frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx` measures each
  placeholder against its real row in headless Edge. jsdom has no layout engine and passes a
  half-height placeholder.

## Settle the typing before you query

A query driven by typed text is built from the SETTLED text through `useDebounce`
(`shared/hooks/use-debounce.ts`): 300 ms on History, Notifications and the Activity filters, 200 ms
on Catalog (`CATALOG_QUERY_DEBOUNCE_MS`). The input's text stays immediate (the store updates per keystroke; only the query waits),
and the surface keeps its rows, so nothing flickers. One typing burst costs exactly one query.
Debounce the WHOLE filters object: stores rebuild it only when a filter changes, so its identity is
stable, and debouncing fields one by one silently drops any field you forgot to list.

## What the tests must assert

- `getByRole('status', { name })` while loading, and the placeholder count.
- **The negative**: real content is absent while loading.

  ```ts
  expect(await screen.findByRole('status', { name: LABEL })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'A real row' })).toBeNull(); // the half that matters
  ```

- Neither the region nor the placeholder survives once the request settles, on success or failure.
- The empty state does not render while loading or on failure, and the skeleton row height matches
  the real row (layout fixture).

Asserting only that the skeleton appears and later disappears passes while both blocks render at
once; that exact gap is how the stacking bug shipped. Asserting visible loading text is weaker than
the role query: it proves the words are on screen, not that anything announces them.
