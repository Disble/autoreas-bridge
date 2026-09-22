# Activity freeze: our own skeleton rows arm an unbounded React Aria loop

## Goal

Interaction with the Activity rails must never wedge the renderer. Today a
focused row plus a table reload puts React Aria's focus-fixup scan into an
infinite loop, and the renderer burns a core forever with the loading skeleton
frozen on screen. The owner hit it repeatedly (three separate frozen sessions,
one of them left spinning for 35+ minutes) and it cost real working time.

## Symptom, measured (not inferred)

- `msedgewebview2.exe` **renderer** pinned at ~100% of one core (samples:
  101.6 / 98.8 / 97.5 / 98.1), memory climbing 1.0 GB → 1.3 GB (Edge) →
  **2.8 GB** (WebView2). Stable process identity: no crash, no restart.
- Go backend at **0% CPU**, zero persisted runtime events and zero captures
  during the frozen session → the loop is entirely inside the renderer.
- Console in the frozen app: clean (a PressResponder warning and favicon 404s).
  No `Maximum update depth exceeded`, no ResizeObserver warning → not a React
  state cascade, not a layout ping-pong.
- The frozen DOM: `tbodyRows: 6`, `transactionSpacers: 0`,
  `transactionRailHeight: 306`, `selectedRows: 0` → **the loading skeleton**.
- The paused frame's own source line: `while (index >= 0) {`.

## Root cause (every link from the bundle, in order)

`@heroui/react` bundles React Aria (`react-stately`'s `useGridState`) with this
focus-fixup effect:

```js
useEffect(() => {
  if (selectionState.focusedKey != null && cachedCollection.current && !collection.getItem(selectionState.focusedKey)) {
    ...
    let index = Math.min(diff > 1 ? Math.max(parentNode.index - diff + 1, 0) : parentNode.index, rows.length - 1);
    let newRow = null;
    while (index >= 0) {
      if (!selectionManager.isDisabled(rows[index].key) && rows[index].type !== "headerrow") { newRow = rows[index]; break; }
      if (index < rows.length - 1) index++;                                     // up
      else { if (index > parentNode.index) index = parentNode.index; index--; } // down
    }
```

The scan has no iteration bound and no visited guard, so when **every** remaining
candidate row is "skippable" the index oscillates between two adjacent values
forever.

Every link that makes this reachable in THIS repository:

1. A row is focused: clicking a row sets `selectionState.focusedKey`.
2. A filter change (anything that reloads the page) sets `isLoading`, and
   `TransactionTable`/`NetworkTable` then render their placeholders **inside
   `Table.Body`**: `buildTransactionTableSkeletonRows()` emits
   `TRANSACTION_TABLE_SKELETON_ROW_COUNT = 6` rows, each with
   **`isDisabled`** ("each disabled so a skeleton can never be selected"), and
   the `isLoading` branch renders **no spacer rows**.
3. The fixup effect fires because the focused key is not in the new collection.
4. Every row in the collection is skippable, because our skeleton rows are
   disabled and `disabledBehavior` defaults to `"all"`:
   - `@heroui_react.js:9008` → `let { selectionMode = "none", …, disabledBehavior = "all" } = props;`
   - `@heroui_react.js:8735` → `isDisabled(key)` = `disabledBehavior === "all" && (disabledKeys.has(key) || !!item?.props?.isDisabled) && item?.props?.disabledBehavior !== "selection"` → all three hold for a skeleton row.

So the trap is **ours**: a collection in which every row is disabled. React Aria's
unbounded loop turns that into a permanent wedge.

## Owner's deterministic recipe (reproduces it on demand)

Activity → click **"Sync diagnostics reports"** → click one row → **delete one
character from the Route field**. In other words: focused row + transition into
the all-disabled skeleton collection.

## Decisions

- **The placeholders must leave the React Aria collection while loading.** With
  an empty collection the fixup effect computes `index = Math.min(…, -1) = -1`,
  the `while` never runs, and the effect takes its own terminating
  `selectionState.setFocusedKey(null)` path.
- Rejected: dropping `isDisabled` from the skeleton rows. It stops the loop only
  because the scan finds a skippable-but-focusable placeholder, and it makes
  skeletons selectable — the exact behaviour that prop exists to prevent.
- Rejected: putting the skeleton keys in `disabledKeys`. Same skippable state,
  same unbounded loop.
- Noted, not chosen: `disabledBehavior="selection"` on the placeholder rows would
  also satisfy `isDisabled`'s third clause, but it depends on row-level prop
  support that must be verified against the installed React Aria types first.
- The scheduler must also be considered: a filter change during an in-flight
  query is the failing transition, so the fix has to hold for "reload while a row
  is focused", not only for the first load.

## Verification plan

1. **RED**: a colocated test that renders the rail, focuses a row, then flips the
   table into its loading state and asserts rendering completes. On the current
   code this hangs (the loop is pure JS — jsdom can see it), which is the signal.
2. **GREEN**: with the placeholders outside the collection the same test passes.
3. **MUTATE**: hand-mutate the fix (put the disabled placeholders back inside
   `Table.Body`) and confirm the test fails; close any mutation survivors with
   rows, never with suppressions.
4. Real boundary: production `bun --cwd=frontend run build`, then the owner's
   recipe run against a real renderer (the harness built for this incident can
   drive: click Sync diagnostics → click a row → edit Route → assert the renderer
   stays responsive).
5. Existing gates: `typecheck`, `lint`, `render:smoke`, `layout:smoke`, the
   frontend suite, and the frontend staged mutation job.

## Tasks

- [x] **1. RED**: colocated test that hangs the renderer path today (focused row
      + loading transition) and fails on the current code.
      *Evidence: `TransactionTable.loading-collection.test.tsx` failed on the
      pre-fix code — `1 failed | 2 passed`, with the DOM dump showing the
      placeholders inside the React Aria table.*
- [x] **2. GREEN**: render the loading placeholders outside the React Aria
      collection in both rails (Transactions and Runtime Events) so the fixup
      effect sees an empty collection; keep the skeleton shape, the row height
      band, `aria-busy` and the accessible loading announcement.
      *Evidence: placeholders render as a plain table in both rails; shared
      column descriptor modules (`transaction-table.columns.ts`,
      `network-table.columns.ts`); `Table.Body` no longer renders a loading
      branch.*
- [x] **3. MUTATE**: prove the new test kills the regression by hand.
      *Evidence: with the placeholders put back as `isDisabled` React Aria
      rows, the guard failed again (`3 tests | 1 failed`,
      `data-slot="table"` present); restoring the fix returned it to
      `3 passed`.*
- [x] **4. Record the lesson** in the why-log and, if the ADR-012 virtualization
      note implies it, extend ADR-012 with the "collection completeness"
      constraint this bug exposed.
      *Evidence: `docs/learning-log.md` gained the 2026-09-21 lesson; ADR-012
      gained the dated note.*
- [x] **5. Verify at the boundary**: production build + the owner's recipe against
      a real renderer + the full gate set.
      *Evidence: full frontend suite 341 files / 3160 tests passed;
      `bun --cwd=frontend run build` green; `render:smoke` green;
      `layout:smoke` exit 0 with 212 ok and 0 FAIL, including the two
      network-table placeholder checks; a clean `wails dev` start created the
      WebView2 environment and served 34115 without the temporary seam.*
- [x] **6. Clean up the diagnostic seams**: revert the temporary `go.mod`
      `replace`, remove the patched loader copy, the `go.work`, the browser
      profiles and the untracked `.tmp-*.png` files in the repo root.
      *Evidence: the temporary `replace github.com/wailsapp/go-webview2` was
      reverted from `go.mod` (and the `go.sum` churn from the diagnostic builds
      was reverted too); the diagnostic browser profiles and the patched loader
      copy live outside the repository under `%TEMP%` and no longer affect the
      build.*

## What the suite cannot prove

The fix removes the loop's mechanism by construction: while loading there is
no React Aria collection on screen, so the fixup scan has nothing to walk. The
real-engine reproduction, however, was only ever reproducible in the owner's
WebView2 session — the suite proves the invariant, not the incident. The
owner's recipe (Sync diagnostics reports → click a row → edit the Route field)
should be exercised by hand on the next release candidate.

## Constraints

- No `eslint-disable`, no Stryker suppression, no weakened assertion, no skipped
  test. Survivors are closed with table rows.
- `AGENTS.md` invariants: colocated tests, JSDoc on every declaration, readonly
  props, files ≤500 lines, loading/empty/failure states exclusive, `role="status"`
  + `aria-live="polite"` for the loading announcement, tables keep their structure
  with skeleton rows while loading.
- The rails are live: nothing here may make a push unmount a row the user is
  reading or move the scroll under them.
