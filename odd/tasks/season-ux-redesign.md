# Season UX redesign

## Objective and scope
Implement the user-approved (2026-10-06) Season workspace UX redesign from the canvas https://claude.ai/artifact/LhPPQvPkeVGBgLG1VFJTYD (v4, 7 artboards). **Functionality stays exactly the same**: every existing action, guard, state and data path is preserved. Only presentation and UX change. Branch `feat/season-ux-redesign` from `dev` (`7f236db`).

## Problem, decisions, and constraints
- The current Season UI shows too much at once (status chips everywhere, long text, plain-text lists) and ignores the real workflow: intake is one-off, the 2-week daily loop is frequent, grading is ~98% on mobile, Selection/Ordering are one-off.
- User design rules from the review rounds (engram #11426, #11431, #11439, #11440, #11442):
  - Less is more. Reduce noise by removing redundant elements or by structure, **never by hiding actions behind hover**.
  - Use bridge's real visual language only:
    - HeroUI `Tabs` and `ToggleButtonGroup`;
    - pill buttons; round tertiary icon buttons with Solar bold-duotone icons via `@iconify-icons/solar`;
    - 44px rounded-lg mini covers with the `AnimeCoverPlaceholder` fallback;
    - semantic tokens only.
  - Every action in a row action group is an icon button. The metadata lookup trigger is a round icon (Solar `magic-stick-3-bold-duotone`).
  - The availability dot belongs to the Intake list row only (meaning: episode 1 exists, ready to create). Remove it from Sin ver. This supersedes SDD-44's dot parity; the user confirmed it.
  - Ordering: anime names must be readable. No redundant position numbers. The grade chip has a fixed width. The newcomer marker is meaningless in the rail (every item there is a newcomer). Follow `shared/ordering/ui/AnimeScheduleOrdering` (the Editor schedule, the direct evolution of the season board) without reusing it.
  - Overview differs by state:
    - **Open season** answers "how am I doing".
    - **Closed (read-only) season** answers "what came out of it": outcome funnel, grade histogram, selection outcome, final lineup. No empty watching-pipeline card.
- Repository rules (`CLAUDE.md`):
  - dumb feature `.tsx`; hook order; colocated folders; no barrels;
  - readonly Props and JSDoc on every declaration;
  - ≤500 effective lines per file;
  - lists that may reach 100 rows render progressively;
  - loading, empty and failure states are exclusive;
  - English code and UI copy, with Spanish data literals kept;
  - `@dnd-kit/react` only.
- TDD: RED → GREEN → MUTATE → REFACTOR.
  - Focused runner: `bun --cwd="frontend" run test -- <path>`.
  - `lefthook` pre-commit (lint, dharness/Fallow, typecheck, full suite, render smoke, layout smoke, staged frontend mutation) is the verification boundary. Never use `--no-verify`.
  - A delegated verify agent owns the final verification of each task before the parent commits.
- RDD is off (global): delivery is `disabled/unmanaged`. No PRs. Integration is a local merge into `dev`, decided by the user.

## Tasks
Route: every task is **delegated direct** (one bounded writer, then one verifier). Trigger evidence: each task touches 2+ non-trivial files (component, hook/helpers, tests), and the reading that prepares each write belongs to its writer.

- [x] **T1 Sin ver dot removal.** Sin ver rows in `DailyBoard` lose the availability dot; their episode-count text stays. Remove `getSinVerAvailabilityIndicator` if it becomes unused, along with its tests.
  - Delegated writer, then an independent verifier: PASS.
  - Diff: 4 files under `DailyBoard/`, +49/−75. `getSinVerAvailabilityIndicator` had a single caller and was deleted together with its tests.
  - RED: the new `it.each` (5 episodes and 0 episodes) failed with "expected document not to contain element, found <span" (2 failed / 8 passed). GREEN: 4 files, 29 tests.
  - `bun --cwd="frontend" run typecheck` exit 0. `bunx eslint` on the touched files is clean.
  - The verifier confirmed the label query would catch the dot if it came back.
  - Note: "No episodes online yet" existed only as the dot's aria-label/tooltip. The visible text was and remains "0 episodes available".
  - The pre-existing `dharness/require-jsdoc` error in the untouched `DailyBoard.checkbox.test.tsx:12` is left alone.
  - Review: RDD off, so disabled/unmanaged.
  - Commit gate, first attempt: an unrelated, date-dependent `HistoryFilterBar` calendar test failed because the real date moved into October. It was fixed in its own commit `689430b` (`Date` pinned with `toFake: ['Date']`), and that commit passed the full gate.
  - Commit gate, second attempt: staged mutation found 2 survivors on the re-indented `row.matchedSlug !== ''` guard.
    - Cause: the existing "no matched slug" test queried `role=link`, but an anchor with an empty href has no link role, so the query could never see it.
    - Fix: the test now queries by label.
    - Hand-applying both mutants (`true &&` and the string literal) now fails the test (1 failed / 9). Restored: 29/29.
- [ ] **T2 Season cover seam.**
  - One shared season thumbnail (44px rounded-lg, `AnimeCoverPlaceholder` fallback, loading skeleton).
  - Cover sources: a created row resolves through `getAnimeCover(animeId)` with caching (reuse the existing cover hooks/patterns from Today/Editor where possible); an intake row uses its applied metadata cover URL.
  - No per-render refetch storms.
- [ ] **T3 Intake list rows.**
  - Each row: thumbnail; a one-line metadata summary (kind · eps · duration · studio) once metadata is applied.
  - Actions are round icons in order: metadata lookup (magic stick), page, folder, ⋯. The ⋯ menu holds Undo autofill / Clear metadata / Discard.
  - The match chip shows only for states that need attention (Ambiguous, Not found, Pending, Discarded); Matched shows no chip.
  - The availability dot stays at the far right.
  - Footer actions render only when actionable: Run matching, Check availability, Create n.
  - Raw/List toggle, candidates, reconcile and read-only behavior unchanged.
- [ ] **T4 Daily board.**
  - Sin ver: rows with covers and no dot; when empty, a compact one-line resolved-empty state.
  - Ver hoy: rows with a cover and the weekday chip.
  - Visto: a disclosure, collapsed by default, showing its count; when expanded, rows are grouped by weekday (ordered by section order, no position numbers), plus a "Not scheduled yet" group.
  - Download notice, Re-check and Send to Ver hoy unchanged.
- [ ] **T5 Evaluation.**
  - Covers. Ungraded rows first, with Rate (secondary) and Skip (ghost) visible.
  - Graded/skipped rows: grade chip plus a round icon that opens the existing rate modal.
  - The source · date line stays. The warning alert stays.
- [ ] **T6 Selection.**
  - Covers. Rows grouped as Approved / Rejected, replacing the Verdict column.
  - Consideration select and desktop actions stay visible.
  - Rules header (steppers, quota, confirmation, Confirm modal) unchanged in behavior.
- [ ] **T7 Ordering.**
  - Seven weekday columns in one row, with headers outside the columns, allowed to use the full available width.
  - "Approved to place" area below the columns.
  - Cards: the name clamped to 2 lines with the full name as a tooltip; a fixed-width grade chip; an always-visible action row (desktop actions, Duplicate, Remove); a muted "New" text only on weekday cards for newcomers.
  - Raw `bg-zinc-*` replaced with tokens.
  - Drag and drop, read-only rules, history states, autosave and Apply/Reset unchanged.
- [ ] **T8 Overview and shell.**
  - Open season: the season-mode explanation moves into an Overview season card next to Close season.
  - Read-only shell: the Closed chip plus a muted "Read-only — editing is disabled." line and Back to history, instead of the warning alert.
  - Closed Overview: an outcome funnel (intake → created → rated → approved/slots), grade histogram, selection outcome, and a final lineup from the recorded ordering snapshot (with covers and grades).
  - When closed, the watching-pipeline, intake-health and KPI tiles are omitted.

## Acceptance
- Every existing handler, guard, disabled/hidden condition, toast and modal still behaves as before (tests prove it), except the documented presentation changes above.
- No hover-only action anywhere.
- Gates green per commit. Render smoke passes.

## Delivery
- Forecast: about 2,500–3,500 authored changed lines across 8 units. This is above the ~400 heuristic, which is advisory.
- Strategy: feature-branch work-unit commits, no PRs, local merge into `dev` when the user decides (the user's correction recorded in `preseason-readiness`).

## Progress
- 2026-10-06: branch created; task document written. Next: T1.
