# Design — sdd-47-season-overview-charts

## Context

The proposal resolved the WHAT and the chart FORMS (form-first heuristic): a KPI
stat-tile row, a watching-pipeline horizontal stacked bar, an intake-health
horizontal stacked bar, a grade histogram with a threshold marker, and a slots
meter. This design resolves the HOW at the architectural level: the colocated
module layout, the hook/helper/constants boundaries, the exact nivo data shapes,
the literal chart palette (with oklch source and hex), the nivo theme object, the
responsive layout, accessibility, and the test design. It does not enumerate task
steps — that is `sdd-tasks`.

Ground truth verified against code (code wins over docs):
- App runs **dark**: `frontend/index.html` is `<html lang="en" class="dark">`,
  and `@heroui/styles` keys the dark token block on `.dark, [data-theme="dark"]`
  (`node_modules/@heroui/styles/dist/themes/default/variables.css:177`).
- Charts render inside a HeroUI `Card`/`Surface`, whose dark background is
  `--surface: oklch(0.2103 0.0059 285.89)` → **`#18181B`** (zinc-900). This is the
  surface the validator must run against (`--surface #18181B --mode dark`).
- HeroUI v3 exposes **no readable CSS variable** for nivo and Tailwind color
  utilities are component-scoped; nivo needs literal hex. Hence a literal palette
  in constants (documented drift, promoted to the `autoreas-theme` skill).

---

## Decision 1 — Component architecture (colocated `ui/OverviewPanel/`)

**Decision.** Split the panel into one dumb composition file plus one dumb file
per chart, all fed by a single hook. nivo JSX is verbose and the 400-warn /
500-fail line policy applies to each file, so one `.tsx` per chart keeps every
file well under budget and keeps each chart independently testable.

```
frontend/src/features/season/ui/OverviewPanel/
  index.ts                       # barrel: export { OverviewPanel }
  OverviewPanel.tsx              # dumb composition; calls useOverviewPanel, lays out KPI row + chart grid
  OverviewKpiRow.tsx             # 4 HeroUI stat tiles (no nivo)
  WatchingPipelineChart.tsx      # @nivo/bar horizontal stacked (Sin ver→Ver hoy→Visto)
  IntakeHealthChart.tsx          # @nivo/bar horizontal stacked (match statuses)
  GradeHistogramChart.tsx        # @nivo/bar vertical columns + threshold marker layer
  SlotsMeter.tsx                 # HeroUI Meter (no nivo)
  use-overview-panel.ts          # the only stateful/effectful unit
  overview-panel.helpers.ts      # pure aggregators (TDD)
  overview-panel.types.ts        # readonly Props + nivo data-row shapes
  overview-panel.constants.ts    # palette literals + nivo theme + labels + chart heights
  __tests__/
    overview-panel.helpers.test.ts
    use-overview-panel.test.ts
    OverviewPanel.test.tsx
```

`SeasonWorkspace.tsx` replaces the inline `<dl>` (lines ~177-204) and the
`SEASON_WORKSPACE_UPCOMING_MESSAGE`/close-button block with `<OverviewPanel />`.
The "Close season" button and `onCloseSeason` wiring stay in `SeasonWorkspace`
(they are workspace-level, not overview-level) — OverviewPanel is display-only.

**Rationale.** Mirrors the established `EvaluationPanel`/`SelectionBoard`
colocation exactly, so a reviewer already knows the shape. Each chart file is a
pure presentation component (`.tsx` = dumb UI: no `useEffect`, no Wails, no
business logic — every number and color arrives as a prop).

**Rejected alternatives.**
- *All charts as sections inside one `OverviewPanel.tsx`.* Rejected: the combined
  nivo JSX plus the theme wiring would push a single file toward/over 400 lines
  and couple every chart's test to the whole panel.
- *A generic `<BarChart>` wrapper abstraction now.* Rejected: this is the first
  chart feature in the codebase (no precedent to generalize from). Premature
  abstraction — extract a shared wrapper only when the second chart feature lands
  (YAGNI). The shared thing that IS worth centralizing today is the palette + nivo
  theme object, which lives in constants and is promoted to the theme skill.

### Prop shapes (all `readonly`, in `overview-panel.types.ts`)

```ts
export interface OverviewKpiSummary {
  readonly intakeTotal: number;      // all seasonAnimes rows
  readonly createdCount: number;     // availability === 'created'
  readonly ratedCount: number;       // created && (grade >= 1 || skipGrading)
  readonly ratedTotal: number;       // created count (the y in "x/y")
  readonly approvedCount: number;    // countApproved(...)
  readonly slots: number;            // season.slots
}

// One-row stacked-bar datum: an index key plus one numeric field per segment key.
export interface PipelineDatum {
  readonly stage: 'pipeline';
  readonly [section: string]: string | number; // 'Sin ver' | 'Ver hoy' | 'Visto' counts
}
export interface IntakeHealthDatum {
  readonly dim: 'intake';
  readonly [status: string]: string | number;   // pending|matched|ambiguous|not_found|discarded counts
}
export interface GradeHistogramDatum {
  readonly grade: string;            // '1'..'6' (indexBy, string for a band axis)
  readonly count: number;
  readonly emphasis: boolean;        // grade >= minApprovalGrade
}
export interface SlotsMeterModel {
  readonly approved: number;         // true count (may exceed slots)
  readonly slots: number;            // Meter maxValue
  readonly meterValue: number;       // min(approved, slots) — the clamped bar value (never > track)
  readonly isOverQuota: boolean;     // approved > slots
  readonly status: QuotaStatus;      // 'under' | 'at' | 'over' (reused from selection-board.types)
  readonly color: 'accent' | 'success' | 'danger'; // HeroUI Meter color prop
  readonly label: string;            // e.g. "3 / 12" or "14 / 12 · Over quota"
}

export interface OverviewPanelViewModel {
  readonly kpi: OverviewKpiSummary;
  readonly pipeline: readonly PipelineDatum[];      // [] or single row
  readonly pipelineKeys: readonly string[];         // ordinal order
  readonly intakeHealth: readonly IntakeHealthDatum[];
  readonly intakeHealthKeys: readonly string[];
  readonly gradeHistogram: readonly GradeHistogramDatum[];
  readonly minApprovalGrade: number;
  readonly slotsMeter: SlotsMeterModel;
  readonly hasCreated: boolean;      // pipeline/histogram empty-state predicate
  readonly hasIntake: boolean;       // intake-health empty-state predicate
  readonly hasGrades: boolean;       // histogram empty-state predicate
}
```

Each chart `.tsx` takes just the slice it needs (e.g. `WatchingPipelineChart`
receives `data`, `keys`, `hasCreated`), so a chart never reaches into the store.

---

## Decision 2 — Hook anatomy (`use-overview-panel.ts`)

**Decision.** A single hook, strict anatomy order, mirroring `useEvaluationPanel`:

```ts
export function useOverviewPanel(source: SeasonSource = seasonSource) {
  // 3. Context / 3rd-party hooks — store reads (selector per field)
  const season = useSeasonStore((s) => s.season);
  const seasonAnimes = useSeasonStore((s) => s.seasonAnimes);
  const readOnly = useSeasonStore((s) => s.readOnly);
  const errorMessage = useSeasonStore((s) => s.errorMessage);
  const refresh = useSeasonStore((s) => s.refresh);
  const refreshAnimes = useSeasonStore((s) => s.refreshAnimes);

  // 5. Derived state — one useMemo producing the whole view model
  const minApprovalGrade = season?.minApprovalGrade ?? DEFAULT_MIN_APPROVAL_GRADE;
  const slots = season?.slots ?? DEFAULT_SLOTS;
  const viewModel = useMemo(
    () => buildOverviewViewModel(seasonAnimes, minApprovalGrade, slots),
    [seasonAnimes, minApprovalGrade, slots],
  );

  // 7. Effects — refetch on mount (the real "live" mechanism; see drift note)
  useEffect(() => {
    void refresh(source);       // season fields (minApprovalGrade, slots)
    void refreshAnimes(source); // per-anime dataset the charts aggregate
  }, [refresh, refreshAnimes, source]);

  return { readOnly, errorMessage, ...viewModel };
}
```

**Rationale.** HeroUI Tabs do not keep an inactive panel mounted, so re-entering
Overview remounts the hook and the effect refetches — no polling/WS infra
(confirmed in exploration). `refresh` is added alongside `refreshAnimes` because
Overview reads season-level fields (`minApprovalGrade`, `slots`) that the other
panels don't refetch; both store actions already no-op under `readOnly`/past-season
guards, so past seasons keep their loaded snapshot.

**Drift correction (proposal item 7).** While editing, fix the two doc comments
that falsely claim the desktop store "refreshes live on the `season_changed`
realtime signal" (`season-store.ts:59`, `use-evaluation-panel.ts:11`) — that
channel is mobile-only. The hook's own JSDoc states the true refetch-on-mount
mechanism. One-line comment edits, independently revertable.

**Rejected alternative.** *`ensureAnimesLoaded` instead of `refreshAnimes`.*
Rejected: `ensureAnimesLoaded` short-circuits when `hasLoadedAnimes` is already
true, so a season that progressed while Overview was unmounted would show stale
aggregates. Overview wants the freshest snapshot on every entry; `refreshAnimes`
always refetches (still guarded for past seasons).

---

## Decision 3 — Pure helpers (`overview-panel.helpers.ts`, TDD)

All exported, JSDoc'd, and side-effect-free. Approved/verdict logic is **never
re-derived** — it delegates to `countApproved`/`quotaStatus` from
`selection-board.helpers.ts` (the drift-proof twin of the Go golden suite).

| Helper | Signature | Notes |
|---|---|---|
| `buildOverviewViewModel` | `(rows, minApprovalGrade, slots) => OverviewPanelViewModel` | Orchestrates the others; the hook's single memo target. |
| `buildKpiSummary` | `(rows, minApprovalGrade, slots) => OverviewKpiSummary` | `approvedCount` via `countApproved(rows, minApprovalGrade)`. **Rated x/y is created-rows-only** (spec-adopted): `ratedTotal` (y) = count of `availability==='created' && animeId!==''` rows; `ratedCount` (x) = those with `grade>=1 \|\| skipGrading`, i.e. `y` minus the `countUngraded`-equivalent (`grade<1 && !skipGrading`) over created rows. |
| `buildWatchingPipelineData` | `(rows) => { data: PipelineDatum[]; keys: string[] }` | Counts `availability==='created'` rows by `section` into the three ordinal keys; `data=[]` when no created rows. **`section` is a first-class backend-populated field** ("Sin ver"/"Ver hoy"/"Visto", empty for uncreated rows) — this is a direct filter+group, **not** a derive-section helper. |
| `buildIntakeHealthData` | `(rows) => { data: IntakeHealthDatum[]; keys: string[] }` | Counts all rows by `matchStatus` across the five keys; `data=[]` when `rows.length===0`. |
| `buildGradeHistogramData` | `(rows, minApprovalGrade) => GradeHistogramDatum[]` | One datum per grade 1..6 (always all six bands, count may be 0), `emphasis = Number(grade) >= minApprovalGrade`; counts only created rows with `grade>=1`. |
| `buildSlotsMeterModel` | `(rows, minApprovalGrade, slots) => SlotsMeterModel` | `approved=countApproved(...)`; `status=quotaStatus(approved, slots)`; `meterValue=Math.min(approved, slots)`; `isOverQuota=approved>slots`; `color`: under→`accent`, at→`success`, over→`danger`; `label` = `"{approved} / {slots}"` (+ `" · Over quota"` when over). |

Empty-state predicates are plain booleans on the view model (`hasCreated`,
`hasIntake`, `hasGrades`) so each chart `.tsx` renders a HeroUI empty-copy line
instead of a zero-height nivo canvas.

### Exact nivo data shapes

**Watching pipeline** — one horizontal stacked bar:
```ts
data = [{ stage: 'pipeline', 'Sin ver': 3, 'Ver hoy': 5, 'Visto': 4 }]
keys = ['Sin ver', 'Ver hoy', 'Visto']   // ordinal conveyor order preserved
indexBy = 'stage'; layout = 'horizontal'
```
**Intake health** — one horizontal stacked bar (workflow order):
```ts
data = [{ dim: 'intake', pending: 2, matched: 8, ambiguous: 1, not_found: 2, discarded: 1 }]
keys = ['pending', 'matched', 'ambiguous', 'not_found', 'discarded']
indexBy = 'dim'; layout = 'horizontal'
```
**Grade histogram** — vertical columns, one series:
```ts
data = [
  { grade: '1', count: 0, emphasis: false }, ... { grade: '6', count: 4, emphasis: true },
]
keys = ['count']; indexBy = 'grade'; layout = 'vertical'
```
Per-bar color comes from a `colors` callback keyed on `datum.data.emphasis`, not
from a per-value ramp (avoids the "value-ramp on categories" anti-pattern).

---

## Decision 4 — Chart palette (literal constants)

**Decision.** Define literal hex in `overview-panel.constants.ts`, derived from the
HeroUI dark tokens actually in effect (`.dark` block of
`@heroui/styles/.../variables.css`) plus chart-specific neutrals where a HeroUI
token is unusable on the chart surface. Every value below was converted OKLCH →
sRGB (D65, gamma-encoded); the conversion was validated by reproducing HeroUI's
published hexes (success→`#17C964`, default-dark→`#27272A`, surface-dark→`#18181B`).

**Surface & ink (chart chrome):**

| Role | Token source (dark) | oklch | hex |
|---|---|---|---|
| Chart surface (Card bg) | `--surface` | `oklch(0.2103 0.0059 285.89)` | `#18181B` |
| Page plane behind cards | `--background` | `oklch(0.12 0.005 285.823)` | `#09090B` |
| Primary ink (labels/values) | `--foreground`=`--snow` | `oklch(0.9911 0 0)` | `#FCFCFC` |
| Muted ink (axis/ticks) | `--muted` | `oklch(0.705 0.015 286.067)` | `#9F9FA9` |
| Gridline / baseline (hairline) | `--border` | `oklch(0.28 0.006 286.033)` | `#27272A` |

**Semantic status (charts) — from the effective dark tokens:**

| Role | Token (dark) | oklch | hex |
|---|---|---|---|
| accent (brand blue) | `--accent` (not overridden in dark) | `oklch(0.6204 0.195 253.83)` | `#0385F7` |
| success | `--success` (not overridden in dark) | `oklch(0.7329 0.1935 150.81)` | `#17C964` |
| warning | `--warning` (dark) | `oklch(0.8203 0.1388 76.34)` | `#F7B750` |
| danger | `--danger` (dark) | `oklch(0.594 0.1967 24.63)` | `#DB3B3E` |

**Chart-specific neutrals (HeroUI `--default` dark `#27272A` is one step off the
`#18181B` surface — invisible as a bar; charts use lifted zinc-hue grays):**

| Role | value | note |
|---|---|---|
| neutral / in-progress (pending) | `#71717A` (zinc-500) | visible mid-gray on `#18181B` |
| de-emphasis (discarded, below-threshold) | `#62626C` `oklch(0.50 0.015 285.89)` | recessive but inside the dark L band |

### Categorical set — intake health (5 adjacent stacked segments) — VALIDATED

Stack order = workflow order, reusing `getMatchStatusColor` semantics. The HeroUI
chip tokens (`#17C964`/`#F7B750`) FAILED the dark-mode lightness band as bar fills
(too light); the settled values are **chart-grade steps of the same hues** snapped
into the band (hold hue, move lightness):

| segment (in order) | role | oklch | hex |
|---|---|---|---|
| pending | neutral in-progress | `oklch(0.552 0.014 285.9)` | `#71717A` |
| matched | chart-success | `oklch(0.65 0.17 150.81)` | `#17AB55` |
| ambiguous | chart-warning | `oklch(0.67 0.14 76.34)` | `#C58703` |
| not_found | danger (dark token) | `oklch(0.594 0.1967 24.63)` | `#DB3B3E` |
| discarded | de-emphasis | `oklch(0.50 0.015 285.89)` | `#62626C` |

**Validator outcome** (`--surface #18181B --mode dark`): lightness band PASS (all
5), CVD separation PASS (worst adjacent `#C58703↔#17AB55` ΔE 20.7 protan — above
the 12 target, no relief needed for CVD), chroma floor FAIL **only** on the two
deliberate neutrals (`#71717A`, `#62626C`) — accepted as the documented
de-emphasis exception (grays never pass a categorical chroma check by definition;
identity is carried by legend + position + counts), and contrast WARN on
`#62626C` (2.94:1) — **relief is OBLIGATORY**: the legend with visible text labels
and the per-segment tooltip counts are the required secondary channel; tasks MUST
NOT drop the legend from this chart.

### Ordinal set — watching pipeline (Sin ver → Ver hoy → Visto)

**Decision: an ordinal single-hue ramp of the accent blue, light→dark**, NOT the
estado status mapping.

**Rationale.** These are pipeline **stages** with a natural progression (not
started → active today → watched), not good/bad statuses. The dataviz method is
explicit: ordered categories take the ordinal ramp (validate `--ordinal`), and
status tokens are only for good/bad. Using estado colors here (accent/success/…)
would misread the conveyor as unrelated categories and burn status hues on
non-status data. The ramp goes light→dark so "Visto" (accomplished) reads as the
deepest accumulation. Three accent steps (H=253.83 fixed):

| stage | oklch | hex |
|---|---|---|
| Sin ver | `oklch(0.72 0.15 253.83)` | `#5CA7FF` |
| Ver hoy | `oklch(0.6204 0.195 253.83)` (the accent) | `#0385F7` |
| Visto | `oklch(0.50 0.17 253.83)` | `#0061C0` |

**Validator outcome** (`--ordinal --surface #18181B --mode dark`): ALL CHECKS
PASS — monotone light→dark, all ΔL gaps ≥ 0.06, dark-end contrast 2.93:1 (clears
the ordinal ≥2:1 floor), hue spread 2°. Approved as-is.

### Emphasis pair — grade histogram — VALIDATED

- **At/above `minApprovalGrade`:** accent `#0385F7` (emphasis).
- **Below threshold:** de-emphasis gray `#62626C` (CVD vs accent ΔE 58.7 PASS;
  contrast 2.94:1 WARN is the intentional de-emphasis — relief via the grade axis
  labels, tooltip counts, and the KPI tiles).
- **Threshold marker:** a 1px **solid** hairline in muted ink `#9F9FA9` with a
  small "Min N" label, drawn as a custom nivo layer at the band boundary between
  grade `minApprovalGrade-1` and `minApprovalGrade`.

**Rationale.** Emphasis (highlight the relevant side, gray the rest) is the
dataviz-approved way to answer "which side of the line" — better than status
green/red per bar, which would falsely imply each bar is a pass/fail entity. The
threshold is an **annotation**, so it uses recessive muted ink + a label, not a
status hue (keeps it from impersonating a series). Alternative considered:
success-green emphasis + amber threshold line — rejected to avoid status-color
overload; noted for the orchestrator if the validator prefers it.

---

## Decision 5 — nivo theme object

**Decision.** A single `NIVO_THEME` object in constants, applied to every chart via
`<ResponsiveBar theme={NIVO_THEME} />`, so axis/tick/label ink, gridlines, and the
tooltip container all match the HeroUI dark surface in one place.

```ts
export const NIVO_THEME = {
  background: 'transparent',                 // the Card provides #18181B
  text: { fill: CHART_INK.muted, fontFamily: 'inherit', fontSize: 12 },
  axis: {
    domain: { line: { stroke: CHART_INK.gridline, strokeWidth: 1 } },
    ticks: { line: { stroke: CHART_INK.gridline, strokeWidth: 1 }, text: { fill: CHART_INK.muted } },
    legend: { text: { fill: CHART_INK.primary } },
  },
  grid: { line: { stroke: CHART_INK.gridline, strokeWidth: 1 } }, // solid hairline, never dashed
  legends: { text: { fill: CHART_INK.primary } },
  tooltip: { container: { background: CHART_SURFACE, color: CHART_INK.primary, fontSize: 12, borderRadius: 8, border: `1px solid ${CHART_INK.gridline}` } },
};
```

Per-mark specs applied on each `ResponsiveBar`:
- `borderWidth={2}` + `borderColor={CHART_SURFACE}` → the **2px surface gap**
  between stacked segments and adjacent bars (never a stroke around the mark).
- `borderRadius={4}` for rounded data-ends where feasible (thin marks).
- `enableLabel={false}` globally; enable a value label **selectively** only where
  it fits (histogram cap, or the KPI tiles carry the headline numbers instead).
- `enableGridX/Y` recessive; disable the axis with no information (e.g. the single
  index axis of the one-row stacked bars).
- `tooltip` restyled to the HeroUI dark surface (default nivo tooltip → themed
  container above); labels inserted as text (nivo handles escaping).

**Legends.** The two stacked bars (≥2 series) each get a nivo `legends` entry
(swatch + text). The histogram is a single series → **no legend box** (the card
title + the emphasis + the threshold label already say what is plotted).

---

## Decision 6 — Layout & containers

**Decision.** A responsive Tailwind grid inside the Overview tab:

```
OverviewPanel (section, flex flex-col gap-6)
├─ error Alert (when errorMessage)
├─ OverviewKpiRow            → grid grid-cols-2 gap-3 sm:grid-cols-4   (4 stat tiles)
└─ charts grid              → grid grid-cols-1 gap-4 lg:grid-cols-2
   ├─ Card > WatchingPipelineChart   (h-[140px] plot band; stacked single bar is short)
   ├─ Card > IntakeHealthChart       (h-[140px])
   ├─ Card > GradeHistogramChart     (h-[240px]; include x-axis band so labels aren't clipped)
   └─ Card > SlotsMeter              (auto height; HeroUI Meter)
```

- Each chart lives in a `Card` (`Card.Content`) → the chart's `#18181B` surface.
- **Fixed heights include the axis band** (anti-pattern: a height that clips the
  x-axis into a nested scroll). `ResponsiveBar` needs a sized parent, so each
  chart wrapper gets an explicit height class; the histogram is taller to fit the
  grade axis + threshold label.
- **Narrow width:** the charts grid collapses `lg:grid-cols-2` → single column;
  KPI row collapses `sm:grid-cols-4` → 2 columns. The one-row stacked bars stay
  legible because they're horizontal; the histogram keeps its band axis.

Stat tiles follow the figure contract: sentence-case `label`, semibold `value`
in the system sans (no `tabular-nums` on these standalone values), rendered with
HeroUI `Typography` + `Card`.

### Open decision (a) — over-quota slots meter

**Decision.** HeroUI `Meter` (`Meter.Track`/`Meter.Fill`/`Meter.Output`, compound)
driven by the model: `value={meterValue}` (**clamped to `slots`**, so the fill
never exceeds 100% of the track), `maxValue={slots}`, `color={color}`. The
`Meter.Output` renders `label` (the **true** ratio, e.g. `"14 / 12"`). When
`isOverQuota`, the fill is full + `color="danger"` **and** an explicit over-quota
`Chip` (`color="danger"`, text `"Over quota"`) sits beside the meter.

**Rationale.** This satisfies every clause of the spec's over-quota scenario: the
bar caps at 100% (clamp), the true `14/12` is still shown (in `Output`, so no data
is hidden), and the state is visually distinct (danger fill + explicit chip) — it
is never a silent in-range-looking `14/12`. A meter, never a pie (ratio against a
hard limit). The approved count reuses `countApproved`/`quotaStatus`, identical to
the KPI Approved tile — one derivation, no drift.

### Open decision (b) — "Close season" stays in `SeasonWorkspace.tsx`

**Decision.** The existing "Close season" `Button` and its `onCloseSeason` wiring
**remain in `SeasonWorkspace.tsx`** (rendered under/around the Overview tab body,
not inside `OverviewPanel`). `OverviewPanel` is display-only dumb UI.

**Rationale.** Closing a season is a workspace-level lifecycle mutation, not an
overview concern; keeping it out of `OverviewPanel` keeps that module free of any
mutation control and makes the `readOnly` past-season path trivial — `OverviewPanel`
never renders a mutating control, so the spec's "past season Overview is
display-only" requirement holds by construction rather than by a `readOnly` guard
inside the panel. `SeasonWorkspace` already owns the close button's `readOnly`
gate today; that stays unchanged.

---

## Decision 7 — Accessibility

- **Color never alone.** Both stacked bars carry a legend + the tooltip's category
  name + (where it fits) an inline count; the histogram carries the grade axis,
  the emphasis, and the labeled threshold. The intake statuses also read through
  their English labels in the legend.
- **Text uses ink tokens, never the data hue** (`#FCFCFC`/`#9F9FA9`); a label set
  inside a colored segment picks white/ink by luminance.
- **Empty states** are HeroUI copy (`text-muted`), e.g. "No created animes yet —
  the pipeline fills as animes are created." — not a zero-height canvas.
- **Tooltips enhance, never gate:** every value is also on an axis, a legend, or a
  stat tile. Keyboard focus shows the same as hover (nivo default).
- **CVD:** the categorical intake set and the ordinal pipeline ramp are handed to
  the orchestrator for `scripts/validate_palette.js` (`--surface #18181B --mode dark`,
  and `--ordinal` for the pipeline). If the ambiguous↔not_found pair lands in the
  8–12 ΔE band, the legend + inline label satisfy the relief rule; record the
  outcome in the panel doc comment after validation.

---

## Decision 8 — Testing design (strict TDD)

**`overview-panel.helpers.test.ts`** (leads implementation):
- `buildKpiSummary`: empty rows → all zeros; typical mix; over-quota (approved >
  slots); all-skipped grading (ratedCount counts skipped as resolved).
- `buildWatchingPipelineData`: no created rows → `data=[]`; created rows spread
  across the three sections → correct per-key counts and preserved key order.
- `buildIntakeHealthData`: `rows=[]` → `data=[]`; all five statuses present →
  correct counts across keys.
- `buildGradeHistogramData`: all six bands always present; all-ungraded → all
  counts 0; `emphasis` boundary correctness at `grade === minApprovalGrade`
  (inclusive) and `grade === minApprovalGrade-1` (excluded).
- `buildSlotsMeterModel`: under/at/over → correct `status` + `color`; delegates to
  `countApproved`/`quotaStatus` (assert consistency with a known selection case).

**`use-overview-panel.test.ts`** (mirror `use-evaluation-panel.test.ts`):
- Reuse the same `createSource(overrides)` mock + `resetSeasonStore()` pattern.
- On mount, `getSeason` **and** `getSeasonAnimes` are called; the view model
  reflects the mocked rows (e.g. `kpi.createdCount`, `pipeline` counts).
- `readOnly` and `errorMessage` pass through from the store.

**`OverviewPanel.test.tsx`** (mirror `EvaluationPanel.test.tsx`):
- `vi.mock('../use-overview-panel')` returning a fixture view model.
- `vi.mock('@nivo/bar', () => ({ ResponsiveBar: () => <div data-testid="nivo-bar" /> }))`
  — **required**, because `ResponsiveBar` measures its parent and jsdom reports a
  zero-size box (charts would not render). This matches the existing precedent of
  mocking heavy children (`RateAnimeModal`).
- Assert: the four KPI values render; three `nivo-bar` testids present when data
  exists; empty-state copy renders when `hasCreated`/`hasIntake`/`hasGrades` are
  false; the slots meter shows `approved/slots`.

**Rationale.** Helpers and the hook carry all logic and are fully unit-tested;
the component test asserts wiring and empty states only, with nivo mocked because
jsdom cannot lay out a responsive SVG canvas.

---

## Sequence — mount to render

```
User selects Overview tab
  → HeroUI Tabs mounts OverviewPanel (inactive panels are not kept mounted)
  → useOverviewPanel() effect runs:
        refresh(source)        ──▶ store.season   (minApprovalGrade, slots)
        refreshAnimes(source)  ──▶ store.seasonAnimes (per-anime rows)
  → store updates trigger re-render
  → useMemo(buildOverviewViewModel) recomputes chart-ready aggregates
        (delegates approved/verdict to countApproved / quotaStatus)
  → OverviewPanel passes readonly prop slices down
  → OverviewKpiRow / *Chart / SlotsMeter render (nivo reads literal palette + NIVO_THEME)
Any later season mutation (grade, match, create) refetches via the store →
  re-enter Overview → effect refetches → numbers move. No WS/polling.
```

---

## Affected files (design-level)

- NEW `frontend/src/features/season/ui/OverviewPanel/*` (11 files above).
- EDIT `frontend/src/features/season/ui/SeasonWorkspace/SeasonWorkspace.tsx`
  (Overview tab body → `<OverviewPanel />`; keep close-season control).
- EDIT (one-line drift) `season-store.ts:59`, `use-evaluation-panel.ts:11`.
- EDIT `.claude/skills/autoreas-theme/SKILL.md` (add settled chart palette table +
  the "HeroUI `default` dark is invisible as a bar; charts use lifted zinc"
  gotcha; bump version).
- IMPORT-ONLY reuse: `selection-board.helpers.ts` (`countApproved`, `quotaStatus`),
  `intake-panel.helpers.ts` (`getMatchStatusColor` semantics),
  `evaluation-panel.helpers.ts` (`countUngraded` pattern),
  `shared/store/season-store.ts`. No backend / DTO / schema change.

## Risks & validation record

1. ~~ambiguous↔not_found adjacency~~ **RESOLVED**: after snapping to chart-grade
   steps the worst adjacent pair is `#C58703↔#17AB55` at ΔE 20.7 (protan) — PASS
   above the 12 target. Validator run 2026-07-09 by the orchestrator
   (`validate_palette.js --mode dark --surface #18181B`; `--ordinal` for the
   pipeline ramp).
2. ~~Pipeline ordinal darkest step~~ **RESOLVED**: full PASS as designed.
3. **Two neutral grays in one intake chart** (pending `#71717A`, discarded
   `#62626C`): non-adjacent, CVD-separated from every neighbor (set-level PASS),
   chroma-floor FAIL accepted as the documented de-emphasis exception. The
   `#62626C` contrast WARN (2.94:1) makes the legend + tooltip counts OBLIGATORY
   on the intake chart and the grade axis labels obligatory on the histogram.
4. **Threshold marker as a nivo custom layer** on a categorical (band) axis — nivo
   `markers` are value-based on continuous scales, so the boundary line is a small
   custom SVG layer; low risk but new territory (first chart feature).
5. `overview-panel.constants.ts` may approach the 400-line warn if palette + nivo
   theme + labels grow — split palette/theme into `overview-panel.chart-theme.ts`
   if so (advisory, not blocking).
```
