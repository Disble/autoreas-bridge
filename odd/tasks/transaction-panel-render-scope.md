# Transaction panel render scope

## Objective and scope
Make `TransactionPanel.windowing` reliable without raising timeouts or weakening assertions. Also make the real panel's scrolling cheaper. Branch `perf/transaction-panel-render-scope` from `dev` (`7f236db`). Functionality stays exactly the same.

## Problem and evidence (investigation, 2026-10-07)
- The test timed out (5s) in 4 of about 10 full-suite gate runs. Every failure was in "typing a filter…" or "a live pushed capture…", at 6.0–6.2s.
- Verdict: the test is load-bound, not flaky in its logic.
  - Ruled out: memory leak (heap flat), leaked subscriptions or timers, order dependence (4 shuffle seeds pass), and real-time waits other than the debounce.
- Variance source: on the i7-12700K (Balanced plan), Windows moves the Vitest worker onto E-cores, which are 4–5x slower.
  - Pinned to P-cores: live push 344ms, typing 803ms.
  - Pinned to E-cores: 1496ms and 2060ms. The `network` folder on E-cores timed out at 5.6–6.0s.
- Cost source: the virtual window is owned at the panel root (`use-transaction-panel.ts:53`, `useTransactionPanelWindow`).
  - Every scroll or push re-renders the whole panel: preset, filter bar, table, and the detail pane once a row is selected.
  - React development `createElement` accounts for 33% of CPU self time, mostly from HeroUI/react-aria elements.
- "typing a filter" waits a real `setTimeout(TRANSACTION_FILTER_DEBOUNCE_MS)`, a fixed 300ms (`TransactionPanel.windowing.test.tsx:179-181`).

## Constraints
- Rules from `CLAUDE.md`:
  - dumb feature `.tsx`; hook order; colocated folders; no barrels;
  - readonly Props and JSDoc everywhere; ≤500 effective lines;
  - live event-driven lists keep their own window.
- Never raise a test timeout or weaken an assertion. TDD: RED → GREEN → MUTATE → REFACTOR. lefthook is the gate; never use `--no-verify`.
- RDD is off: disabled/unmanaged. No PR; integration is the user's call.

## Tasks
Route: delegated direct (writer, then verifier). Trigger evidence: T2 touches 2+ non-trivial files, and the reading that prepares it belongs to the writer.

- [x] **T1 Fake the filter debounce in the windowing test.** "typing a filter" advances fake timers by `TRANSACTION_FILTER_DEBOUNCE_MS` inside `act` instead of waiting in real time. Every assertion stays the same. Expected saving: a fixed ~300ms.
  - Delegated writer.
  - The test fakes only `setTimeout` and `clearTimeout`, advances them inside `act`, and restores real timers in `finally`.
  - Two hand mutations each failed the test with "Unable to find …anime-9000": a debounce +1ms, and `settledFilters` dropped from the re-query dependencies.
  - Timing pinned to P-cores, 5 runs: "typing a filter" went from 802ms to 410ms; the whole file from 2241ms to 1946ms.
  - Network tests 435/435; staged mutation 2/2.
- [ ] **T2 Scope scroll and push re-renders to the table subtree.** Scrolling and live pushes must no longer re-render the filter bar, the preset control or the detail pane.
  - Behavior is identical: window bounds, spacers, load-more, scroll compensation on prepend, selection.
  - Add a deterministic test proving the isolation, for example a render-count probe or a stable-props check.
  - Measure the before/after per-test timings with the same pinning method.

## Acceptance
- All TransactionPanel and network tests pass with unchanged assertions. Gates are green per commit.
- T2 shows a measured per-test reduction for "live pushed capture" and the scroll-heavy tests.

## Delivery
- Forecast: about 150–300 authored changed lines across 2 units. Strategy: feature-branch work-unit commits.

## Progress
- 2026-10-07: branch and document created. Next: T1.
