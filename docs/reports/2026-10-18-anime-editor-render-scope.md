# Anime editor render scope

Date: 2026-10-18. Logbook: `odd/tasks/anime-editor-render-scope.md`.

## What was observed

- The pre-commit coverage lane fails intermittently on editor and Activity tests. The Vitest default
  timeout is 5 s and the `waitFor` default is 1 s.
- `docs/reports/2026-10-18-pre-commit-resource-contention.md` measured the margin. The editor tests use
  40–65% of the 5 s budget even on an idle machine, and v8 coverage plus a foreground load slows them
  by 1.8–2.9x. That is enough to cross the line.
- Two hypotheses were falsified there. The ListPanel status race still passes with a 1000 ms delay, and
  the AnimeCreate debounce still passes at 900 ms. The failures are load-bound, not logic races.
- Failures also happened without the foreground load: an `ActivityIncidents` `findBy`, the
  `ActivityRunStoryContent` coverage branches at 66.66%, and a synchronous read of a React Aria table
  row, fixed in `797edba8`. The editor is the largest consumer of the shared budget, so its cost is the
  structural part of the problem.

## Measurements (before)

An untracked probe test (`zz-render-count.scratch.test.tsx`) mounts the workspace route, selects
Beta, then Gamma. It wraps every panel in a React `Profiler` and counts its renders. Three runs, idle
machine, no coverage:

| Measure | Value |
|---|---|
| Workspace commits | 24–25 |
| Renders per panel (List, Form, Episodes, Schedule card, Dialogs) | 16 each |
| React render time, whole tree | 401–454 ms |
| AnimeEditorListPanel render time | 133–146 ms |
| AnimeEditorFormPanel render time | 188–214 ms |
| EpisodeDurationsSection, AnimeScheduleCard, AnimeEditorDialogs | 26–38, 13–16, 13–14 ms |
| Test wall time without the probe's final 600 ms wait | ~680–760 ms |

React rendering is about 60% of the test's real work. The list and form panels are about 80% of it.

The slowest editor tests run in isolation:
`AnimeEditorWorkspace.windowing` 1383 ms, `schedule-feedback` 1363 ms, `selection` 1013 ms, and
`EpisodeDurationsSection` "saves the card edits" 801 ms.

## Diagnosis

Every panel receives the whole workspace view model, a new object on each render, so every state
change anywhere re-renders all five panels. A memoized panel could not skip either. For each of the
16 renders, the probe recorded which view-model fields changed identity:

- **Always changed, values unchanged:**
  - `onSelectAnime`, `onSave`, `onDeactivate`, `onRestore`, `onRepeat`, `onOpenSchedule`,
    `onApplySchedule`, `onDiscardAndContinue`, `onSaveAndContinue` and `onConfirmLifecycleAction`.
    `useAnimeEditorTransitions` memoizes each callback on `options`, an object literal that
    `useAnimeEditorWorkspace` builds on every render (`use-anime-editor-workspace.ts:43`).
    `onConfirmLifecycleAction` depends on `transitions`.
  - `listWindow`, the progressive window object.
  - `episodes`, the Episodes card view model.
- **Changed only when the data did:**
  - `items`, `selectedAnimeId` and `isLoadingList`: renders 1, 2, 5 and 10.
  - `selectedRecord`, `draft` and `isLoadingRecord`: renders 2, 3, 6, 8, 11 and 13.
  - `scheduleWeek`, the board read settling.

The list panel's data changed in 4–5 of its 16 renders and the form panel's in about 7. The rest is
render work spent on unchanged props.

## Plan

1. Stabilize the identities that change without a data change: the transition callbacks, the list
   window, the Episodes view model.
2. Give each panel only the slice it reads, memoized, and wrap the panel in `memo`. A render-count test
   pins the result: RED before, GREEN after.
3. Measure the probe's React time and the slow tests' wall time before and after, with the same method.

**Falsification.** `odd/tasks/transaction-panel-render-scope.md` T2 is a precedent: isolating panels
cut their render counts there with no time gain, because the cost sat inside one subtree. If this
unit's step 2 cuts the counts but not the measured time, it is dropped the same way and recorded here.

## After

**What changed:**
- `useAnimeEditorTransitions` memoizes each callback on the fields it reads, not on `options`.
- `useAnimeEditorListWindow` keeps the window's identity until a part of it changes.
- `useAnimeEditorWorkspace` builds a memoized `listPanel` slice and a memoized `formPanel` slice.
- `AnimeEditorListPanel` and `AnimeEditorFormPanel` are wrapped in `memo` and read only their slice.
- Behavior is unchanged: the editor and app suites pass, 453/453, with their existing assertions unchanged.

**Render counts.** Measured by `AnimeEditorWorkspace.render-scope.test.tsx` over the same flow (mount, then select Beta, then Gamma), 15 workspace steps:

| Panel | Before | After | What still re-renders it |
|---|---|---|---|
| AnimeEditorListPanel | 15 | 7 | rows, loading, and `onSelectAnime` following the selection |
| AnimeEditorFormPanel | 15 | 10 | record loads, and `onSave` following the selection |

**Wall time.** Median of 5 isolated runs, idle machine, no coverage. Before is the same files with the change stashed:

| Test file | Before | After | Change |
|---|---|---|---|
| `AnimeEditorWorkspace.windowing` | 1694 ms | 1545 ms | −9% |
| `AnimeEditorWorkspace.schedule-feedback` | 1375 ms | 1260 ms | −8% |
| `AnimeEditorWorkspace.selection` | 914 ms | 826 ms | −10% |
| `AnimeEditorWorkspace.covers` | 2688 ms | 2679 ms | ≈0 |
| `EpisodeDurationsSection` (untouched control) | 6149 ms | 6118 ms | ≈0 |

The falsification check passes: the count drop shows up as time in the workspace tests and not in the
control. The gain is modest. The step margin the coverage lane runs on improves by roughly a tenth for
these files; it does not remove load-bound failures under a 2–3x slowdown.

**Mutation.** Staged mutation: 65/65 killed. The callback rewrite brought the transition logic
(the rail refresh after deactivate, restore, repeat and apply; selection; and the route guard) into
scope. It had no direct tests, so `use-anime-editor-transitions.test.tsx` was added. Three hand
mutations each fail the render-scope test at 15 renders against a ceiling of 7:
- `memo` removed from the list panel;
- `onSelectAnime` memoized on `options` again;
- the list window returned as a fresh object.

**Gate follow-up.** The first commit attempt was blocked by `fallow audit` on two functions the change touched:
- **`useAnimeEditorWorkspace`, cognitive 17 against 15.** Fallow counts one point per hook, and the two slice `useMemo`s added two. The lifecycle confirmation (its state, copy and confirm/cancel callbacks) moved to `use-anime-editor-lifecycle-confirmation.ts`, with its own test.
- **`AnimeEditorFormPanel`, CRAP 97.** This was existing debt that surfaced once `memo` marked the function as changed. The panel is not in `coverage-tiers.json`, so fallow estimates its coverage. By the owner's decision, the panel was split into dumb parts: `AnimeEditorFormHeader`, `AnimeEditorFormSkeleton`, `AnimeEditorFormFields` and `AnimeEditorFormActions`. The largest cyclomatic complexity is now 7, and fallow reports no findings.
- **Mutation over the moved JSX.** Moving the JSX brought the panel's untested branches into scope: field wiring, disabled states, the status chip and the empty selection. `AnimeEditorFormPanel.wiring.test.tsx` covers them, and staged mutation reached 195/201. The 6 survivors, with the reason each is skipped:
  - the Status select's `null` guard: a single-select with no clear affordance cannot emit `null` from the UI;
  - the skeleton slot counts (4): shape only, nothing observes them;
  - the `useCallback` deps of a stable state setter: an equivalent mutant.

**Not done, and why:**
- **`onSelectAnime` and `onSave` still change identity when the selection changes**, through
  `selectedAnimeId` and `reloadSchedule`. That costs about 5 extra panel renders per two selections.
  Removing them needs latest-value refs, which add ordering subtlety in exchange for a gain that the
  transaction-panel precedent suggests is marginal.
- **`EpisodeDurationsSection`, `AnimeScheduleCard` and `AnimeEditorDialogs` still render on every
  step.** Together they cost about 55 ms of the probe's 430 ms.
- **The largest editor files are elsewhere**: `EpisodeDurationsSection` at ~6.1 s per file and
  `covers` at ~2.7 s. Their cost is not workspace re-renders, and the next unit should profile them
  directly.
