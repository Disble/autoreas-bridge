# Activity filters: settle the typing before the query, never flash a skeleton

## Goal

Typing in an Activity filter must not reload the rail on every keystroke. Today
each character runs a query, flips the rail into its loading state and swaps the
rows for skeletons, so the panel flickers with every letter. The owner's report
(2026-09-21): "mientras estés escribiendo no debería cargarse el esqueleto…
te parpadea los ojos… espera el render hasta que termines de escribir… no por
cada letra como está ahorita".

Two outcomes are required:

1. **The query is built from the settled text**: a burst of typing produces one
   query, `TRANSACTION_FILTER_DEBOUNCE_MS` / `NETWORK_FILTER_DEBOUNCE_MS` after
   the last keystroke, through the app-wide `useDebounce` hook (the pattern
   History, Notifications, Catalog and AnimeCreate already use).
2. **The rail keeps reading**: while that debounced query is in flight the
   previous rows stay on screen with a discreet "updating" hint. The skeleton is
   reserved for the case it exists for — a rail that has nothing to show yet.

This also narrows the exposure of the freeze fixed in
`odd/tasks/activity-filter-freeze.md`: the all-disabled loading collection is now
reachable only on a first load, not on every keystroke.

## Decisions

- **Owner's choice (2026-09-21)**: "previous rows + subtle notice", not a single
  skeleton flash after the pause. The hint is visible text, not only an
  announcement.
- **The hint lives in the rail's existing status line** ("Showing N captured
  transactions per page; …"), which is already the panel's own status surface.
  It adds no grid item and no height, so the layout gate that measures the
  Activity cards keeps its budget.
- **The input text stays immediate.** The store's filters update per keystroke
  (cheap state); only the query waits. Debouncing the *fields* rather than the
  filters object avoids the identity trap `useDebounce` would otherwise hit,
  because a fresh object on every render would restart the timer forever.
- **The live-push admission keeps the immediate filters.** The Transactions push
  listener already reads the store snapshot, and the Runtime Events listener
  already reads `getNetworkStoreState()`, so neither is affected by debouncing
  the query input; a push is judged against what the user actually typed.
- **Two flags, two meanings.** `isLoading` keeps meaning "nothing to show yet
  and a query is in flight" (skeleton + announcement). A new `isUpdating` means
  "a query is in flight while rows are on screen" (`aria-busy` plus the same
  announcement, rows untouched).

## Plan (all done, evidence below)

- [x] **Transactions rail**: the four typed fields are debounced through one
      `useDebounce(filters, TRANSACTION_FILTER_DEBOUNCE_MS)` over the whole
      filters object — the query effect and `loadMore` both read it.
- [x] **Runtime Events rail**: the same single debounce over its memoized
      filters object.
- [x] **The two loading meanings** are separate flags: `isLoading` (nothing to
      show yet → skeleton) and `isUpdating` (rows on screen + query in flight →
      rows stay, `aria-busy`, discreet hint in the status line).
- [x] **Guards**: a burst guard per rail (one query per typing burst) plus a
      non-typed-field guard on the Transactions rail (a change to `animeId`,
      `deviceId`, `changelogId`, `startMs`, `endMs` still queries), and
      keep-previous-rows / first-load-skeleton guards per rail.
- [x] **Boundary**: the rails' suites, the full frontend suite, `typecheck`,
      `render:smoke`, `layout:smoke`, the production build.

## Evidence

- **The first implementation was wrong and was caught in review.** It debounced
  the four typed fields individually and merged the remaining fields from a ref
  read during render, with the memo keyed on the settled typed fields. Since
  `setFilters` rebuilds `filters` only when a filter changes, that object's
  identity is already stable, so the whole shape could be one `useDebounce`
  call — and the ref-merge silently dropped any change to a non-typed field
  (`animeId`, `errorCode`, `deviceId`, `changelogId`, `startMs`, `endMs`).
  Replaced with the single debounce; the Transactions guard for it went RED
  against the old shape (`expected to be called 2 times, but got 1 times`) and
  green after.
- **Suites**: rails `24 files / 309 tests`; full frontend suite `3169 passed`.
- **Gates**: `typecheck` exit 0; production build green; `render:smoke` green;
  `layout:smoke` exit 0 with 212 `ok` and 0 `FAIL` (the updating hint adds no
  grid item and no height, so the card budgets held).
- **What the guards pin**: one query per typing burst after the window, every
  filter field (typed or not) still triggering its own settled query, the
  previous rows surviving a refetch with `aria-busy` and the hint and zero
  placeholders, and the skeleton still rendering for a rail with nothing to
  show yet.

## Constraints

- JSDoc on every declaration, `readonly` props, no `index.ts` barrels, files
  ≤500 lines, English only. No `eslint-disable`, no skipped test, no weakened
  assertion, no new dependency.
- Do not touch the virtual window contract, the selection contract, the spacer
  rows or the push-admission rules.
- `useDebounce` is the only debounce mechanism: no second timer implementation.
