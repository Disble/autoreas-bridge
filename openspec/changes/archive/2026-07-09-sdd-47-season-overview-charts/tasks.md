# Tasks — sdd-47-season-overview-charts

Strict TDD is active for this change. Within each work unit, the test file for a
logic-bearing module is written first (RED — run `bun --cwd=frontend run test`
and confirm the new spec fails/doesn't compile), then the implementation is
added to turn it GREEN. Dumb `.tsx` composition/leaf components with no
independent unit-test file (per Design Decision 8, only three `__tests__` files
are specified: helpers, hook, and the `OverviewPanel` wiring test) are still
built RED→GREEN at the work-unit level: `OverviewPanel.test.tsx` is written
first in wu3 against not-yet-existing components, then every chart/composition
file is implemented to satisfy it.

Each task lists the spec requirement(s) it satisfies in `(Req: ...)`.

---

## wu1 — Dependency, palette/constants, types, pure helpers (TDD)

- [x] 1.1 Run `bun add @nivo/bar` (targeting `>=0.98.0`) in `frontend/` — **never
      hand-edit `package.json`**. Confirm afterward that `frontend/package.json`
      shows `@nivo/bar` and no other new `@nivo/*` entry.
      (Req: "`@nivo/bar` is the only charting dependency")

- [x] 1.2 Create `frontend/src/features/season/ui/OverviewPanel/overview-panel.types.ts`
      — `OverviewKpiSummary`, `PipelineDatum`, `IntakeHealthDatum`,
      `GradeHistogramDatum`, `SlotsMeterModel`, `OverviewPanelViewModel`, plus a
      `readonly *Props` interface per chart/leaf component (`OverviewKpiRowProps`,
      `WatchingPipelineChartProps`, `IntakeHealthChartProps`,
      `GradeHistogramChartProps`, `SlotsMeterProps`). Every property MUST be
      `readonly` (per Design Decision 1's prop shapes).
      (Req: "Overview is a colocated `OverviewPanel` module" — dumb-UI Props
      contract; underpins every chart requirement's data shape)

- [x] 1.3 Create `frontend/src/features/season/ui/OverviewPanel/overview-panel.constants.ts`
      — literal hex constants only (never Tailwind classes or HeroUI `color`
      props): `CHART_SURFACE` (`#18181B`), `CHART_INK` (`primary #FCFCFC`,
      `muted #9F9FA9`, `gridline #27272A`), the ordinal pipeline ramp
      (`PIPELINE_COLORS`: Sin ver `#5CA7FF`, Ver hoy `#0385F7`, Visto `#0061C0`),
      the intake-health categorical set (`INTAKE_HEALTH_CHART_COLORS` keyed by
      the `getMatchStatusColor` **role** — `success→#17AB55`,
      `warning→#C58703`, `danger→#DB3B3E`, `default`(pending)→`#71717A`,
      `default`(discarded)→`#62626C`; see 1.5 for why this is keyed by role,
      not by `matchStatus` directly), the histogram emphasis pair
      (`EMPHASIS_COLOR #0385F7` / `DE_EMPHASIS_COLOR #62626C`), the threshold
      marker ink (`#9F9FA9`), the `NIVO_THEME` object (transparent background,
      `CHART_INK` text/axis/grid/legend/tooltip wiring per Design Decision 5),
      empty-state copy strings, and chart wrapper height classes
      (`h-[140px]`/`h-[240px]`). If this file approaches ~380 lines, split the
      palette/theme block out into a sibling
      `overview-panel.chart-theme.ts` (Design risk #5 — advisory, not
      blocking).
      (Req: "Chart palette is centralized and documented" — literal-constants
      scenario)

- [x] 1.4 **(RED)** Write
      `frontend/src/features/season/ui/OverviewPanel/__tests__/overview-panel.helpers.test.ts`
      covering, before any implementation exists:
      - `buildKpiSummary`: empty rows → all zeros; the spec's mixed-status
        scenario (10 total / 6 created / "Rated 6/6" with 4 graded + 2
        skip-graded / `countApproved` = 3 vs `slots` = 12); the
        rescue-consideration scenario (`grade=3`, `minApprovalGrade=4`,
        `consideration='temporarily_approved'` still counts as approved via
        `countApproved`, never a parallel `grade >= minApprovalGrade` check).
      - `buildWatchingPipelineData`: no created rows → `data=[]`; created rows
        spread across "Sin ver"/"Ver hoy"/"Visto" → correct per-key counts,
        fixed key order regardless of which count is largest; uncreated rows
        (empty `section`) excluded from the total.
      - `buildIntakeHealthData`: `rows=[]` → `data=[]`; 2 pending / 3 matched
        (1 created) / 1 ambiguous / 1 not_found / 1 discarded → total 8, the
        created-matched row still counted.
      - `getIntakeHealthSegmentColor` (or equivalent): for `matched`, the
        returned color's semantic role MUST equal `getMatchStatusColor('matched')`
        (`'success'`) — asserted by comparing role/token, not raw hex, so the
        chart-tuned literal hex can differ from the HeroUI chip hex while the
        mapping is still delegated to `getMatchStatusColor`, never re-derived
        with an independent switch.
      - `buildGradeHistogramData`: all six grade bands 1–6 always present;
        `[6,5,5,0,0]` with both `0`s `skipGrading=true` → height-1 column for
        grade 6, height-2 for grade 5, no column represents the skip-graded
        rows; `emphasis` boundary at `grade === minApprovalGrade` (inclusive,
        e.g. `minApprovalGrade=4` emphasizes 4/5/6, de-emphasizes 1/2/3).
      - `buildSlotsMeterModel`: under/at/over-quota → correct `status`/`color`;
        over-quota case (`approved=14`, `slots=12`) → `meterValue=12` (clamped,
        never exceeds the track), `isOverQuota=true`, `label` includes the true
        `"14 / 12"` ratio.
      - `buildOverviewViewModel`: orchestrates all of the above into one view
        model; fresh-season (`seasonAnimes=[]`) → `hasCreated`/`hasIntake`/
        `hasGrades` all `false`; all-graded season → `hasGrades=true` and no
        column represents an ungraded remainder.
      Run `bun --cwd=frontend run test` and confirm these fail (module doesn't
      exist yet).
      (Req: "KPI stat-tile row", "Watching pipeline chart", "Intake health
      chart", "Grade histogram with approval-threshold emphasis", "Slots
      meter, never a pie", "Empty and edge states render without breaking")

- [x] 1.5 **(GREEN)** Implement
      `frontend/src/features/season/ui/OverviewPanel/overview-panel.helpers.ts`
      to satisfy 1.4: `buildKpiSummary` (delegates `approvedCount` to
      `countApproved` from `selection-board.helpers.ts`; `ratedTotal`/`ratedCount`
      computed over created rows only, per Design Decision 3's exact formula),
      `buildWatchingPipelineData` (direct filter+group on the backend-populated
      `section` field, fixed key order `['Sin ver','Ver hoy','Visto']`, no
      derive-section logic), `buildIntakeHealthData` (group by `matchStatus`
      across all five keys, no `availability` filter),
      `getIntakeHealthSegmentColor(matchStatus)` (calls `getMatchStatusColor`
      from `intake-panel.helpers.ts` to resolve the semantic role, then maps
      that role to the literal chart hex in `INTAKE_HEALTH_CHART_COLORS` —
      this is the bridge between the spec's "reuse `getMatchStatusColor`,
      never re-derive" rule and the design's chart-tuned literal hex),
      `buildGradeHistogramData` (all six bands always present, counts created
      rows with `grade>=1` only, `emphasis = Number(grade) >= minApprovalGrade`),
      `buildSlotsMeterModel` (delegates to `countApproved`/`quotaStatus`;
      `meterValue = Math.min(approved, slots)`; `color` under→`accent`,
      at→`success`, over→`danger`), `buildOverviewViewModel` (orchestrator +
      `hasCreated`/`hasIntake`/`hasGrades` booleans). Every exported helper has
      JSDoc. Make 1.4 green.
      (Req: same set as 1.4, plus "Approved count reuses decideVerdict, never a
      parallel calculation" and "Intake health colors reuse
      getMatchStatusColor")

---

## wu2 — Reactive hook + drift-comment corrections

- [x] 2.1 **(RED)** Write
      `frontend/src/features/season/ui/OverviewPanel/__tests__/use-overview-panel.test.ts`,
      mirroring `use-evaluation-panel.test.ts`'s `createSource(overrides)` mock
      + `resetSeasonStore()` pattern: on mount, both `getSeason` and
      `getSeasonAnimes` MUST be called (i.e. `refresh(source)` AND
      `refreshAnimes(source)` both fire); the returned view model reflects the
      mocked rows (`kpi.createdCount`, `pipeline` counts, etc.); `readOnly` and
      `errorMessage` pass through unchanged from the store. Run the suite and
      confirm it fails (hook doesn't exist yet).
      (Req: "Reactive data wiring" — mount refetch scenario; "re-entering
      Overview after a mutation elsewhere shows current data")

- [x] 2.2 **(GREEN)** Implement
      `frontend/src/features/season/ui/OverviewPanel/use-overview-panel.ts`
      with strict hook anatomy (imports → signature → refs → state →
      context/3rd-party hooks → derived state → callbacks → effects → return),
      per Design Decision 2: store selectors for `season`, `seasonAnimes`,
      `readOnly`, `errorMessage`, `refresh`, `refreshAnimes`; a single
      `useMemo(() => buildOverviewViewModel(...), [...])`; a mount `useEffect`
      calling `void refresh(source)` and `void refreshAnimes(source)`
      (`refreshAnimes`, never `ensureAnimesLoaded`, so a season that
      progressed while Overview was unmounted isn't shown stale). Add a JSDoc
      block on the hook stating the real mechanism: refetch-on-mount +
      refetch-after-mutation (no WS/polling). Make 2.1 green.
      (Req: "Reactive data wiring")

- [x] 2.3 Fix the doc-comment drift on `useSeasonStore` in
      `frontend/src/shared/store/season-store.ts` (near line 59): remove the
      false claim that the store "refreshes live on the `season_changed`
      realtime signal" and replace it with a description of the real
      refetch-on-mount / refetch-after-mutation mechanism (that channel is
      mobile-only, no listener exists in `frontend/src`). One-line,
      independently revertable.
      (Req: "Doc-comment drift correction" — season-store.ts scenario)

- [x] 2.4 Fix the equivalent doc-comment drift on `useEvaluationPanel` in
      `frontend/src/features/season/ui/EvaluationPanel/use-evaluation-panel.ts`
      (near line 11): remove the claim that Wails I/O is "refreshed live on
      `season_changed`" and describe the real mechanism.
      (Req: "Doc-comment drift correction" — use-evaluation-panel.ts scenario)

- [x] 2.5 Run `bun --cwd=frontend run validate` (eslint + tsc) and
      `bun --cwd=frontend run test` — confirm wu1 + wu2 are fully green before
      committing this work unit.

---

## wu3 — Chart components, OverviewPanel composition, SeasonWorkspace wiring

- [x] 3.1 **(RED)** Write
      `frontend/src/features/season/ui/OverviewPanel/__tests__/OverviewPanel.test.tsx`,
      mirroring `EvaluationPanel.test.tsx`: `vi.mock('../use-overview-panel')`
      returning a fixture view model; `vi.mock('@nivo/bar', () => ({
      ResponsiveBar: () => <div data-testid="nivo-bar" /> }))` (required —
      jsdom cannot lay out a responsive SVG canvas). Assert: the four KPI
      values render (Intake rows total / Created animes / Rated x/y / Approved
      n/slots); three `nivo-bar` testids present when pipeline/intake/histogram
      data exists; empty-state copy renders instead of a chart when
      `hasCreated`/`hasIntake`/`hasGrades` are each `false` in turn; the slots
      meter shows `approved/slots` and, for the over-quota fixture, an explicit
      over-quota indicator (never a silent `"14/12"`); with `readOnly: true` in
      the fixture, no mutating control (button/input) is rendered anywhere in
      the panel. Run the suite and confirm it fails — none of these
      files/components exist yet.
      (Req: "OverviewPanel.tsx is dumb UI", "no information regression versus
      the prior inline Overview", "Empty and edge states render without
      breaking", "over-quota approval does not break the meter", "Past seasons
      render Overview read-only")

- [x] 3.2 **(GREEN)** Implement `OverviewKpiRow.tsx` — four HeroUI stat tiles
      (`Card` + `Typography`) for Intake rows total / Created animes / Rated
      x/y / Approved n/slots, sentence-case labels, semibold values, laid out
      `grid grid-cols-2 gap-3 sm:grid-cols-4`. Pure props in, no store access.
      (Req: "KPI stat-tile row")

- [x] 3.3 **(GREEN)** Implement `WatchingPipelineChart.tsx` — `ResponsiveBar`
      horizontal stacked bar, `keys=['Sin ver','Ver hoy','Visto']` in that
      fixed order (never sorted by count), `PIPELINE_COLORS` from constants,
      `NIVO_THEME` applied, `borderWidth={2}`/`borderColor={CHART_SURFACE}` for
      the segment gap, a nivo `legends` entry (≥2 series), and the
      `hasCreated`-gated empty-state placeholder from constants instead of a
      zero-height canvas.
      (Req: "Watching pipeline chart", "Empty and edge states render without
      breaking" — zero created animes scenario)

- [x] 3.4 **(GREEN)** Implement `IntakeHealthChart.tsx` — `ResponsiveBar`
      horizontal stacked bar, `keys` in workflow order
      (`pending/matched/ambiguous/not_found/discarded`), colors resolved via
      `getIntakeHealthSegmentColor` from `overview-panel.helpers.ts` (never a
      re-derived switch), `NIVO_THEME`, a nivo `legends` entry, and per-segment
      tooltip counts. The legend and tooltip counts are **obligatory, not
      optional** — the validated palette accepted a contrast WARN on the
      `discarded` gray (`#62626C`, 2.94:1) on the condition that the legend +
      tooltip carry the secondary identification channel (Design Decision 4 /
      Risk 3). `hasIntake`-gated empty-state placeholder for zero rows.
      (Req: "Intake health chart", "intake health colors reuse
      getMatchStatusColor", "Empty and edge states render without breaking")

- [x] 3.5 **(GREEN)** Implement `GradeHistogramChart.tsx` — `ResponsiveBar`
      vertical columns, one series (`keys=['count']`, `indexBy='grade'`), a
      `colors` callback keyed on `datum.data.emphasis` (never a per-value
      ramp) using `EMPHASIS_COLOR`/`DE_EMPHASIS_COLOR`, a custom nivo layer
      drawing the 1px solid threshold hairline (`CHART_INK.muted`) with a
      small "Min N" label at the band boundary between `minApprovalGrade-1`
      and `minApprovalGrade`, no `legends` box (single series — the card
      title + emphasis + threshold label already convey what's plotted), and
      the `hasGrades`-gated empty-state placeholder for all-ungraded data.
      Wrapper height (`h-[240px]`) sized to include the grade axis so labels
      aren't clipped.
      (Req: "Grade histogram with approval-threshold emphasis", "Empty and
      edge states render without breaking" — zero graded animes scenario)

- [x] 3.6 **(GREEN)** Implement `SlotsMeter.tsx` — HeroUI `Meter`
      (`Meter.Track`/`Meter.Fill`/`Meter.Output`) with `value={meterValue}`
      (clamped, never exceeds the track), `maxValue={slots}`,
      `color={model.color}`, `Meter.Output` rendering the true ratio label
      (e.g. `"14 / 12"`, never a normal-looking `"14/12"` with no visual
      distinction); when `isOverQuota`, render an additional `Chip
      color="danger"` reading "Over quota" beside the meter. No pie/donut
      element anywhere in this file.
      (Req: "Slots meter, never a pie", "over-quota approval does not break
      the meter")

- [x] 3.7 **(GREEN)** Implement `OverviewPanel.tsx` + `index.ts` barrel —
      dumb composition only (no `useEffect`, no Wails calls, no business
      logic): calls `useOverviewPanel()`, renders an error `Alert` when
      `errorMessage`, `<OverviewKpiRow />`, then a `grid grid-cols-1 gap-4
      lg:grid-cols-2` of `Card`-wrapped charts
      (`WatchingPipelineChart`/`IntakeHealthChart`/`GradeHistogramChart`/
      `SlotsMeter`), passing only the prop slices each chart needs. Does not
      render the "Close season" control (stays in `SeasonWorkspace.tsx` — see
      3.8). Make 3.1 green.
      (Req: "Overview is a colocated `OverviewPanel` module",
      "OverviewPanel.tsx is dumb UI", "Past seasons render Overview
      read-only" — display-only by construction, no `readOnly` branch needed
      inside the panel itself)

- [x] 3.8 Edit
      `frontend/src/features/season/ui/SeasonWorkspace/SeasonWorkspace.tsx`:
      replace the inline `<dl>` (~lines 177-204, the created-date/
      minApprovalGrade/slots block) with `<OverviewPanel />` in the Overview
      tab body. Keep the "Close season" `Button` and its `onCloseSeason` +
      `readOnly` wiring in `SeasonWorkspace.tsx` (workspace-level lifecycle
      control, not an Overview concern — Design Decision 6b). Confirm no
      inline `<dl>` describing the season remains in this file, and that the
      created-date label, minimum approval grade, and slots values are all
      still visible somewhere in the Overview tab (now via `OverviewKpiRow`).
      (Req: "SeasonWorkspace renders OverviewPanel", "no information
      regression versus the prior inline Overview", "Close season stays in
      SeasonWorkspace")

- [x] 3.9 Run `bun --cwd=frontend run validate` and
      `bun --cwd=frontend run test` — confirm wu1 + wu2 + wu3 are fully green
      before committing this work unit.

---

## wu4 — `autoreas-theme` skill documentation

- [x] 4.1 Update `.claude/skills/autoreas-theme/SKILL.md`: add a "Chart
      palette (nivo, literal hex)" section documenting the settled values from
      the validated palette — surface/ink neutrals (`#18181B`/`#09090B`/
      `#FCFCFC`/`#9F9FA9`/`#27272A`), the semantic status set
      (`accent #0385F7`/`success #17C964`/`warning #F7B750`/`danger #DB3B3E`),
      the chart-tuned neutrals (`#71717A`/`#62626C`), the categorical intake
      set with role mapping, the ordinal pipeline ramp (light→dark accent
      steps), and the emphasis pair for the histogram. State plainly that
      nivo consumes literal hex only (never Tailwind classes/HeroUI `color`
      props) because HeroUI v3 exposes no readable CSS variable for it.
      (Req: "chart palette is documented in the theme skill")

- [x] 4.2 In the same SKILL.md edit, add the gotcha: HeroUI's `--default` dark
      token (`#27272A`) is only one lightness step off the `#18181B` card
      surface and is **invisible as a chart bar fill** — charts use lifted
      zinc-hue grays (`#71717A`/`#62626C`) instead, snapped into the dark
      lightness band while holding hue.
      (Req: "chart palette is documented in the theme skill")

- [x] 4.3 Bump the SKILL.md frontmatter `version` from `1.0.8` to `1.0.9` and
      add a changelog entry summarizing the SDD-47 chart palette addition
      (literal hex constants, the categorical/ordinal/emphasis sets, and the
      `--default`-dark-invisible-as-bar gotcha).
      (Req: "its version MUST be bumped from the pre-change version")

---

## Gate

- [x] 5.1 Full lefthook/pre-commit gate green on each commit: frontend
      `validate` (eslint + tsc), `test` (vitest), and the file-size gates
      (`bun --cwd=frontend run filesize:warning` advisory,
      `go run ./tools/checkgofilesize` n/a for this frontend-only change but
      still part of the repo-wide pre-commit hook set). Final confirmation
      that `frontend/package.json` shows `@nivo/bar>=0.98.0` as the sole new
      `@nivo/*` dependency and no file under
      `frontend/src/features/season/ui/OverviewPanel/` exceeds the 400-warn /
      500-fail effective-line policy.

---

## Review Workload Forecast

| wu | New/edited files | Rough line estimate |
|---|---|---|
| wu1 | `overview-panel.types.ts`, `overview-panel.constants.ts`, `overview-panel.helpers.ts`, `overview-panel.helpers.test.ts`, `package.json` (bun-managed) | ~550-650 |
| wu2 | `use-overview-panel.ts`, `use-overview-panel.test.ts`, `season-store.ts` (1-line), `use-evaluation-panel.ts` (1-line) | ~180-230 |
| wu3 | `OverviewKpiRow.tsx`, `WatchingPipelineChart.tsx`, `IntakeHealthChart.tsx`, `GradeHistogramChart.tsx`, `SlotsMeter.tsx`, `OverviewPanel.tsx`, `index.ts`, `OverviewPanel.test.tsx`, `SeasonWorkspace.tsx` (edit) | ~600-750 |
| wu4 | `.claude/skills/autoreas-theme/SKILL.md` (edit) | ~35-45 |
| **Total** | **~17 touched files** | **~1,365-1,675 lines** |

**Chained PRs recommended: No.** This repository has no PR workflow —
work-unit commits land directly on `main`, each independently passing the
full gate (`bun --cwd=frontend run validate`, `bun --cwd=frontend run test`,
pre-commit file-size hooks). The four work units above (wu1-wu4) already
function as the review/commit boundary in place of a PR chain; each is
independently green and independently revertable. The ~1,365-1,675 total
estimated lines exceed the 400-line single-review budget by a wide margin,
but that budget is naturally satisfied per-commit rather than per-change: no
single work unit's diff should individually approach 500 lines, and no
individual file exceeds the 400-warn/500-fail effective-line policy (the one
file flagged as a risk, `overview-panel.constants.ts`, has an explicit
advisory split path into `overview-panel.chart-theme.ts` in task 1.3 if
needed). No `size:exception` decision is required for this change.
