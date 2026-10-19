# Anime editor render scope

Objective: stop the editor workspace re-rendering every panel on every async step, so the editor tests regain margin under the 5 s and 1 s budgets. Branch: `dev`, by owner instruction. Delivery: work-unit commits on `dev`. Runner: Bun/Vitest (`bun --cwd="frontend" run test -- <path>`).
Report: `docs/reports/2026-10-18-anime-editor-render-scope.md`.

## Specs
- S1 (L1, verbatim): "Sobre lo de los renders, sí, necesito que lo documentes, luego crees una vitacora, luego lo arregles, luego lo vuelva a documentar."
- S2: the order is document → logbook → fix → document again. The report holds the before and the after.
- S3: behavior stays identical. Existing editor tests pass with unchanged assertions; no timeout is raised.
- S4: the fix is proven by measurement. A deterministic render-count test goes RED before and GREEN after, plus the probe's React time and the slow tests' wall time, before and after. Assumption: a count drop without a time drop drops the step, as in `transaction-panel-render-scope.md` T2.

## Tasks
| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 Document the problem with measurements | S1, S2 | inline | done | report "Measurements (before)" and "Diagnosis" |
| T2 Create this logbook and its Engram mirror | S1, S2 | inline | done | this file; topic `odd/anime-editor-render-scope/tasks` |
| T3 Stabilize identities: transition callbacks, list window | S3, S4 | inline | done | per-field callback deps; window useMemo. Episodes view model left as is: 26–38 ms, see report |
| T4 Panel slices + `memo`, render-count test RED → GREEN, timings | S3, S4 | inline | done | RED 15 vs 7.5, GREEN list 7 / form 10; −8 to −10% on 3 workspace files; mutation 65/65 |
| T5 Document the after in the report | S2 | inline | done | report "After" |
| T6 Gate follow-up: lifecycle hook extraction, form panel split, wiring tests | S3, S4 | inline | done | L8–L9; fallow 0 findings; mutation 195/201; verifier PASS |

Route evidence: no writer trigger. It is one behavior in one folder, and the parent already holds the map.

## Log
- L1 (2026-10-18, user): "Sobre lo de los renders, sí, necesito que lo documentes, luego crees una vitacora, luego lo arregles, luego lo vuelva a documentar."
- L2 (2026-10-18): baseline probe, 3 runs:
  - 16 renders per panel, 24–25 commits, React 401–454 ms. ListPanel 133–146 ms, FormPanel 188–214 ms.
  - Field-change log: every transition callback, `listWindow` and `episodes` changed identity on all 16 renders. Cause: `useAnimeEditorTransitions` memoizes on `options`, a fresh literal every render.
- L3 (2026-10-18): flaky evidence carried in from the contention report:
  - falsified H1 (ListPanel status race) and H2 (AnimeCreate debounce);
  - flakes without the game: ActivityIncidents findBy, ActivityRunStoryContent branches, React Aria row read fixed in `797edba8`;
  - `TestLoggedEventSurvivesBridgeRestart` nil-pointer flake in go-cover. That one is Go and out of this scope.
  - Same synchronous grid read pattern still present: `NotificationCenterPanel.row-affordances.integration.test.tsx:83`. Out of scope, noted.
- L4 (2026-10-18): T3+T4 done. Render-scope test RED "expected 15 to be less than or equal to 7.5", GREEN at list 7 and form 10. Medians of 5 runs: windowing 1694→1545, schedule-feedback 1375→1260, selection 914→826, covers 2688→2679, EpisodeDurationsSection control 6149→6118 ms.
- L5 (2026-10-18): staged mutation surfaced 16 survivors in the rewritten transition logic, which had no direct tests. Added use-anime-editor-transitions.test.tsx; then 65/65 killed. Hand mutations (memo removed, onSelectAnime back on options, fresh window) each fail at 15 vs 7.
- L6 (2026-10-18): not chased: onSelectAnime and onSave identity on selection (latest-value refs, marginal); EpisodeDurationsSection (6.1 s per file) and covers (2.7 s) are the next profiling targets.
- L7 (2026-10-18): delegated verifier PASS S1-S4, no blockers; 436/436 editor+app tests, typecheck clean, render-scope test stable 3/3. Advisory fixed: report count 431 -> 436.
- L8 (2026-10-18): first commit blocked by fallow audit. (1) useAnimeEditorWorkspace cognitive 17 > 15 from hook density: the lifecycle confirmation moved to use-anime-editor-lifecycle-confirmation.ts, with a test. (2) AnimeEditorFormPanel CRAP 97 on estimated coverage, existing debt surfaced by memo. Owner chose "Dividir el panel (Recommended)": split into FormHeader/FormSkeleton/FormFields/FormActions, max CC 7, fallow 0 findings.
- L9 (2026-10-18): staged mutation over the moved JSX: 161/201, then 195/201 after AnimeEditorFormPanel.wiring.test.tsx and a stronger cancel test. Skipped with reasons: Status select null guard (unreachable), skeleton slot counts x4 (shape only), stable-setter useCallback deps (equivalent). Pre-existing flake seen once: AnimeEditorListPanel "renders no status region…" (H1 race), passes 6/6 alone. Suites 453/453.
- L10 (2026-10-18): verifier PASS on the delta (pure move confirmed, 453/453). Committed on dev.
