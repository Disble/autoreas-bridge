# Spec — Season Overview Charts

## ADDED Requirements

### Requirement: `@nivo/bar` is the only charting dependency

The frontend SHALL depend on `@nivo/bar` at version `>=0.98.0`, installed via `bun add` in
`frontend/` (never by hand-editing `package.json`), and SHALL NOT depend on any other `@nivo/*`
package for this change.

#### Scenario: nivo bar dependency is present and pinned
- **GIVEN** `frontend/package.json` after this change
- **WHEN** the `@nivo/bar` entry is inspected
- **THEN** it MUST resolve to a version `>=0.98.0`
- **AND** no other `@nivo/*` package MUST appear as a new dependency

### Requirement: Overview is a colocated `OverviewPanel` module

The Season Workspace Overview tab SHALL be rendered by a new colocated
`frontend/src/features/season/ui/OverviewPanel/` module (`index.ts`, `OverviewPanel.tsx`,
`use-overview-panel.ts`, `overview-panel.helpers.ts`, `overview-panel.types.ts`,
`overview-panel.constants.ts`, `__tests__/`), mirroring the `EvaluationPanel` / `SelectionBoard`
colocation convention. `SeasonWorkspace.tsx` SHALL render `<OverviewPanel />` in place of the
current inline `<dl>`. `OverviewPanel.tsx` MUST contain no Wails calls, no `useEffect`, and no
business logic — all aggregation, color selection, and refetch orchestration MUST live in
`use-overview-panel.ts` / `overview-panel.helpers.ts` / `overview-panel.constants.ts`.

#### Scenario: SeasonWorkspace renders OverviewPanel
- **GIVEN** the Season Workspace with a season loaded
- **WHEN** the user opens the Overview tab
- **THEN** the tab body MUST be `<OverviewPanel />`
- **AND** no inline `<dl>` describing the season MUST remain in `SeasonWorkspace.tsx`

#### Scenario: no information regression versus the prior inline Overview
- **GIVEN** the season's created-date label, minimum approval grade, and slots values
- **WHEN** `OverviewPanel` renders
- **THEN** all three values MUST still be visible somewhere in the Overview tab, exactly as they
  were before this change

#### Scenario: OverviewPanel.tsx is dumb UI
- **GIVEN** `OverviewPanel.tsx`
- **WHEN** its source is inspected
- **THEN** it MUST NOT call any Wails-bound function directly
- **AND** it MUST NOT declare a `useEffect`
- **AND** all `*Props` interfaces it consumes, declared in `overview-panel.types.ts`, MUST have
  every property marked `readonly`

### Requirement: KPI stat-tile row

`OverviewPanel` SHALL render four HeroUI stat tiles — not charts — derived from `seasonAnimes` and
`season`: **Intake rows total**, **Created animes**, **Rated x/y**, and **Approved n/slots**.

1. Intake rows total MUST equal `seasonAnimes.length` (every row, any `matchStatus`).
2. Created animes MUST equal the count of rows where `availability === 'created'`.
3. Rated x/y MUST count, over created rows only (`availability === 'created' && animeId !== ''`):
   `y` = the created-row count, `x` = the count of created rows where `grade >= 1 || skipGrading`
   (i.e. `y` minus the `countUngraded`-equivalent count of created rows with `grade < 1 &&
   !skipGrading`).
4. Approved n/slots MUST use `countApproved(seasonAnimes, season.minApprovalGrade)` from
   `selection-board.helpers.ts` for `n`, and `season.slots` for the denominator — the count MUST
   NOT be re-derived independently of `decideVerdict`.

#### Scenario: KPI tiles reflect a mixed-status season
- **GIVEN** a season with 10 intake rows total, 6 of them `availability === 'created'`, 4 of the
  created rows with `grade >= 1` (2 more `skipGrading`), and `countApproved` returning 3 against
  `season.slots = 12`
- **WHEN** `OverviewPanel` renders
- **THEN** the tiles MUST show "Intake rows total: 10", "Created animes: 6", "Rated: 6/6" (4 graded
  + 2 skip-graded), and "Approved: 3/12"

#### Scenario: approved count reuses decideVerdict, never a parallel calculation
- **GIVEN** a created row with `grade = 3`, `season.minApprovalGrade = 4`, and
  `consideration = 'temporarily_approved'`
- **WHEN** the Approved tile's count is computed
- **THEN** that row MUST be counted as approved (matching `decideVerdict`'s rescue-consideration
  rule), because the tile calls `countApproved`/`decideVerdict` rather than checking `grade >=
  minApprovalGrade` directly

### Requirement: Watching pipeline chart

`OverviewPanel` SHALL render a horizontal stacked `@nivo/bar` chart of created animes grouped by
`section`, with stages fixed in the order **Sin ver → Ver hoy → Visto** regardless of which stage
has the largest count. Only rows with `availability === 'created'` (non-empty `section`)
contribute; uncreated rows (empty `section`) MUST be excluded.

#### Scenario: pipeline stage order is fixed
- **GIVEN** created rows distributed as 1 "Sin ver", 5 "Ver hoy", 2 "Visto"
- **WHEN** the watching pipeline chart renders
- **THEN** the stage order along the chart MUST be Sin ver, then Ver hoy, then Visto — not sorted
  by count

#### Scenario: uncreated rows never enter the pipeline chart
- **GIVEN** a season with 3 created rows and 4 uncreated rows (matched/pending/ambiguous)
- **WHEN** the watching pipeline chart's data is derived
- **THEN** its total bar count MUST equal 3, not 7

### Requirement: Intake health chart

`OverviewPanel` SHALL render a horizontal stacked `@nivo/bar` chart of ALL intake rows (created and
uncreated) grouped by `matchStatus` (`pending | matched | ambiguous | not_found | discarded`),
using `getMatchStatusColor` from `intake-panel.helpers.ts` for each category's color (matched →
success, ambiguous → warning, not_found → danger, pending/discarded → default) — the mapping MUST
NOT be re-derived independently.

#### Scenario: intake health counts every row regardless of creation state
- **GIVEN** a season with 2 pending, 3 matched (1 of them created), 1 ambiguous, 1 not_found, and 1
  discarded row
- **WHEN** the intake health chart's data is derived
- **THEN** the total across all categories MUST equal 8 (`seasonAnimes.length`), including the
  created matched row

#### Scenario: intake health colors reuse getMatchStatusColor
- **GIVEN** the intake health chart's category color for `matched`
- **WHEN** it is compared against `getMatchStatusColor('matched')`
- **THEN** they MUST be the same color token (`success`)

### Requirement: Grade histogram with approval-threshold emphasis

`OverviewPanel` SHALL render a vertical `@nivo/bar` histogram with one column per grade 1–6,
counting created rows (`availability === 'created' && animeId !== ''`) with `grade >= 1` — rows
where `skipGrading === true` and `grade < 1` MUST be excluded from every column. Columns for grades
`>= season.minApprovalGrade` MUST be visually emphasized (accent/success); columns below the
threshold MUST be visually de-emphasized (default); the threshold MUST be visually marked on the
chart (e.g. a boundary marker between the last de-emphasized and first emphasized column).

#### Scenario: histogram excludes skip-graded and ungraded rows
- **GIVEN** created rows with grades `[6, 5, 5, 0, 0]` where both `grade = 0` rows have
  `skipGrading = true`
- **WHEN** the grade histogram's data is derived
- **THEN** it MUST show one column of height 1 for grade 6 and one column of height 2 for grade 5
- **AND** no column MUST represent the two skip-graded rows

#### Scenario: threshold emphasis follows minApprovalGrade
- **GIVEN** `season.minApprovalGrade = 4` and histogram columns for grades 1 through 6
- **WHEN** the histogram renders
- **THEN** columns for grades 4, 5, and 6 MUST use the emphasized color
- **AND** columns for grades 1, 2, and 3 MUST use the de-emphasized color

### Requirement: Slots meter, never a pie

`OverviewPanel` SHALL render approved count vs `season.slots` as a HeroUI meter/progress
component. A pie/donut chart MUST NOT be used for this ratio. The approved count MUST come from
`countApproved`/`quotaStatus` (`selection-board.helpers.ts`), reusing the same derivation as the
Approved n/slots KPI tile.

#### Scenario: slots meter renders as a progress/meter component
- **GIVEN** `countApproved` returns 8 against `season.slots = 12`
- **WHEN** the slots meter renders
- **THEN** it MUST be a HeroUI meter/progress element showing 8 of 12
- **AND** no pie or donut element MUST be rendered for this ratio

#### Scenario: over-quota approval does not break the meter
- **GIVEN** `countApproved` returns 14 against `season.slots = 12` (`quotaStatus` = `'over'`)
- **WHEN** the slots meter renders
- **THEN** it MUST render without error and MUST visually indicate the over-quota state (e.g. a
  capped/full bar plus an explicit over-quota indicator), MUST NOT render a bar exceeding 100% of
  its track, and MUST NOT silently display "14/12" as if it were a normal in-range value with no
  visual distinction

### Requirement: Reactive data wiring

`use-overview-panel.ts` SHALL read `season`, `seasonAnimes`, and `readOnly` from `useSeasonStore`
and SHALL call `refreshAnimes(source)` (and `refresh(source)` for season fields) in a mount effect,
mirroring the `EvaluationPanel`/`IntakePanel` reactivity pattern. All chart-ready aggregates SHALL
be `useMemo`'d from the raw `seasonAnimes` array in `overview-panel.helpers.ts`. No WebSocket
client and no polling infrastructure SHALL be introduced.

#### Scenario: OverviewPanel refetches on mount
- **GIVEN** the user navigates to the Overview tab
- **WHEN** `OverviewPanel` mounts
- **THEN** `refreshAnimes(source)` MUST be called
- **AND** `refresh(source)` MUST be called for the season fields

#### Scenario: re-entering Overview after a mutation elsewhere shows current data
- **GIVEN** the user grades an anime on the Evaluation tab, raising its grade above
  `minApprovalGrade`
- **WHEN** the user switches back to the Overview tab
- **THEN** the grade histogram and the Approved n/slots tile MUST reflect the updated grade and
  approval count, because switching tabs remounts `OverviewPanel` and its mount effect refetches
  `seasonAnimes`

### Requirement: Empty and edge states render without breaking

Every chart in `OverviewPanel` SHALL render a friendly empty placeholder — not a broken or blank
SVG — whenever its underlying data set is empty, and SHALL degrade gracefully for other boundary
data shapes.

#### Scenario: fresh season with zero intake rows
- **GIVEN** a season with `seasonAnimes.length === 0`
- **WHEN** `OverviewPanel` renders
- **THEN** the KPI tiles MUST show zero values
- **AND** every chart MUST show an empty-state placeholder instead of an empty/broken chart canvas

#### Scenario: zero created animes
- **GIVEN** a season with intake rows but none `availability === 'created'`
- **WHEN** the watching pipeline chart renders
- **THEN** it MUST show an empty-state placeholder instead of a zero-height chart

#### Scenario: zero graded animes
- **GIVEN** created rows that are all ungraded (`grade === 0`, `skipGrading === false`)
- **WHEN** the grade histogram renders
- **THEN** it MUST show an empty-state placeholder instead of an all-zero-column chart

#### Scenario: all animes graded
- **GIVEN** every created row has `grade >= 1` or `skipGrading === true`
- **WHEN** the KPI Rated tile renders
- **THEN** it MUST show "Rated: N/N" with no ungraded remainder, and no chart MUST error on the
  fully-populated data set

### Requirement: Past seasons render Overview read-only

When `readOnly === true` (viewing a past season), `OverviewPanel` SHALL render the same KPI tiles
and charts from that season's data, and SHALL NOT render any interactive mutation control.

#### Scenario: past season Overview is display-only
- **GIVEN** a past season loaded via `viewPastSeason` (`readOnly === true`)
- **WHEN** the user opens its Overview tab
- **THEN** all KPI tiles and charts MUST render from that season's `seasonAnimes`/`season` data
- **AND** `OverviewPanel` MUST NOT render any control that mutates season state

### Requirement: Chart palette is centralized and documented

Chart colors SHALL be defined as literal color constants in `overview-panel.constants.ts` (never
Tailwind classes or HeroUI color props, which nivo cannot consume), matching the values documented
in the `autoreas-theme` skill. Text and axis labels in the charts SHALL use the theme's ink/
foreground color, not a series color. The settled chart palette SHALL be added to
`.claude/skills/autoreas-theme/SKILL.md` with its version bumped.

#### Scenario: chart colors are literal constants, not Tailwind/HeroUI props
- **GIVEN** `overview-panel.constants.ts`
- **WHEN** its exported color values are inspected
- **THEN** each MUST be a literal color string (hex or oklch)
- **AND** none MUST be a Tailwind utility class name or a HeroUI `color` prop token

#### Scenario: chart palette is documented in the theme skill
- **GIVEN** `.claude/skills/autoreas-theme/SKILL.md` after this change
- **WHEN** it is inspected
- **THEN** it MUST list the chart palette values used by `OverviewPanel`
- **AND** its version MUST be bumped from the pre-change version

### Requirement: Doc-comment drift correction

The doc comments in `season-store.ts` (near line 59) and `use-evaluation-panel.ts` (near line 11)
SHALL be corrected to stop claiming the bridge desktop store refreshes live on the `season_changed`
realtime signal — that channel is mobile-only and has no listener in `frontend/src`. The corrected
comments SHALL describe the real mechanism: refetch-on-mount plus refetch-after-mutation.

#### Scenario: season-store.ts doc comment no longer claims desktop realtime refresh
- **GIVEN** the doc comment on `useSeasonStore` in `season-store.ts`
- **WHEN** it is read after this change
- **THEN** it MUST NOT claim the store "refreshes live on the `season_changed` realtime signal"
- **AND** it MUST describe the actual refetch-on-mount / refetch-after-mutation mechanism

#### Scenario: use-evaluation-panel.ts doc comment no longer claims desktop realtime refresh
- **GIVEN** the doc comment on `useEvaluationPanel` in `use-evaluation-panel.ts`
- **WHEN** it is read after this change
- **THEN** it MUST NOT claim Wails I/O is "refreshed live on `season_changed`"
