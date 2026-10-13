import type { OverviewLineupState } from './overview-panel.types';

/**
 * Literal hex chart palette + nivo theme for OverviewPanel. nivo cannot consume
 * Tailwind classes or HeroUI `color` props — it needs literal color strings.
 * Every value here is documented in `.claude/skills/autoreas-theme/SKILL.md`
 * ("Chart palette (nivo, literal hex)"); keep the two in sync.
 */

/** The HeroUI dark Card surface (`--surface`), the background every chart sits on. */
export const CHART_SURFACE = '#18181B';

/** Chart chrome ink, sourced from the HeroUI dark tokens actually in effect. */
const CHART_INK = {
  primary: '#FCFCFC',
  muted: '#9F9FA9',
  gridline: '#27272A',
} as const;

/**
 * Watching pipeline ordinal ramp (Sin ver -> Ver hoy -> Visto), light->dark
 * accent-blue steps. Fixed conveyor order, never sorted by count.
 */
export const PIPELINE_COLORS: Readonly<Record<string, string>> = {
  'Sin ver': '#5CA7FF',
  'Ver hoy': '#0385F7',
  Visto: '#0061C0',
};

/**
 * Intake health categorical set, keyed by the semantic role that
 * `getMatchStatusColor` resolves for each `matchStatus` (chart-tuned literal
 * hex, distinct from the HeroUI chip hex — the chip tokens failed the dark-mode
 * lightness band as bar fills). `discarded` gets its own de-emphasis gray even
 * though `getMatchStatusColor('discarded')` also resolves to the `default`
 * role (same as `pending`) — see `getIntakeHealthSegmentColor`.
 */
export const INTAKE_HEALTH_CHART_COLORS: Readonly<Record<'success' | 'warning' | 'danger' | 'default' | 'discarded', string>> = {
  success: '#17AB55',
  warning: '#C58703',
  danger: '#DB3B3E',
  default: '#71717A',
  discarded: '#62626C',
};

/** Grade histogram emphasis color: at/above minApprovalGrade. */
export const EMPHASIS_COLOR = '#0385F7';
/** Grade histogram de-emphasis color: below minApprovalGrade. */
export const DE_EMPHASIS_COLOR = '#62626C';

/** Threshold hairline + "Min N" label ink for the grade histogram. */
export const THRESHOLD_MARKER_INK = CHART_INK.muted;

/** Fixed conveyor order of the watching pipeline stages. */
export const PIPELINE_KEYS = ['Sin ver', 'Ver hoy', 'Visto'] as const;

/**
 * Fixed workflow order of intake match statuses: the two states a row can be
 * re-attempted from first, then the verdicts, then the state that leaves the
 * flow. `search_failed` sits next to `pending` because both mean the row was
 * never classified, and it shares the danger role with `not_found` — the chart
 * legend is what separates them, since the validated palette has no sixth hue.
 */
export const INTAKE_HEALTH_KEYS = ['pending', 'search_failed', 'matched', 'ambiguous', 'not_found', 'discarded'] as const;

/**
 * Fixed bucket order of the selection outcome chart. Each label doubles as its
 * nivo key and legend text. The third label is "No grade", not "Not yet
 * graded": the same panel renders a closed season, where nothing is pending, so
 * the wording has to be true for a season whose confirmation already applied.
 */
export const SELECTION_OUTCOME_KEYS = ['Approved', 'Rejected', 'No grade'] as const;

/**
 * Selection outcome bucket colors, keyed by their display label. All three are
 * reused literals from the theme skill's validated chart palette: chart-success
 * `#17AB55` for approved, danger `#DB3B3E` for rejected, and the chart-tuned
 * neutral `#71717A` for the no-grade bucket.
 */
export const SELECTION_OUTCOME_CHART_COLORS: Readonly<Record<string, string>> = {
  Approved: '#17AB55',
  Rejected: '#DB3B3E',
  'No grade': '#71717A',
};

/**
 * Consideration token meaning no override was applied. It is the only token a
 * still-undecided candidate carries (mirror of the Go domain enum), so the
 * not-yet-graded bucket requires it.
 */
export const CONSIDERATION_NONE = 'none';

/** All supported grade bands, always displayed in ascending order. */
export const GRADE_BANDS = ['1', '2', '3', '4', '5', '6'] as const;

/** Nice integer tick steps, smallest first. */
export const TICK_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

/** Empty-state copy for the watching pipeline chart when there are no created animes yet. */
export const PIPELINE_EMPTY_MESSAGE = 'No created animes yet — the pipeline fills as animes are created.';

/** Failure message when a closed season's recorded lineup could not be read. */
export const OVERVIEW_LINEUP_LOAD_ERROR = 'Failed to load the recorded lineup';

/** Accessible name of the status region while the recorded lineup is read. */
export const OVERVIEW_LINEUP_LOADING_LABEL = 'Loading final lineup';

/** Copy of a closed season's final lineup card and its honest empty states. */
export const OVERVIEW_LINEUP_COPY = {
  title: 'Final lineup',
  notRecordedTitle: 'Final lineup not recorded',
  notRecordedDescription: 'This season was closed before its ordering board was recorded, so there is no stored lineup to show.',
  emptyTitle: 'No anime was scheduled',
  emptyDescription: 'The ordering board recorded at close had no anime on a weekday.',
  noGradeLabel: 'No grade',
  regionLabel: 'Recorded lineup',
} as const;
/** Empty-state copy for the intake health chart when there are no intake rows yet. */
export const INTAKE_HEALTH_EMPTY_MESSAGE = 'No intake rows yet.';

/** Empty-state copy for the selection outcome chart when no candidate has been created. */
export const SELECTION_OUTCOME_EMPTY_MESSAGE = 'No created candidates yet — the breakdown fills as animes are created.';

/**
 * Card copy stating what the selection outcome chart counts. The buckets are the
 * verdicts the confirmation rules with, and a candidate with no grade counts as
 * rejected — the fact the replaced quota meter never surfaced. The third bucket
 * is labelled "No grade" rather than "Not yet graded" on purpose: this panel is
 * shared with a CLOSED season, whose confirmation already ruled, so wording that
 * implies pending work would be false history there.
 */
export const SELECTION_OUTCOME_CARD_DESCRIPTION =
  'How the confirmation rules on created candidates: approved stays, and a candidate with no grade counts as rejected.';

/** Empty-state copy for the grade histogram when there are no graded animes yet. */
export const GRADE_HISTOGRAM_EMPTY_MESSAGE = 'No graded animes yet — the histogram fills in as animes are rated.';

/** Short chart wrapper height (one-row stacked bars), including their axis band and legend row. */
export const CHART_HEIGHT_SHORT = 'h-[168px]';
/** Tall chart wrapper height (the grade histogram), including its grade axis. */
export const CHART_HEIGHT_TALL = 'h-[240px]';

/**
 * Shared nivo theme: axis/tick/label ink, gridlines, and the tooltip container
 * all match the HeroUI dark surface. Applied to every chart via
 * `<ResponsiveBar theme={NIVO_THEME} />`.
 */
export const NIVO_THEME = {
  background: 'transparent',
  text: { fill: CHART_INK.muted, fontFamily: 'inherit', fontSize: 12 },
  axis: {
    domain: { line: { stroke: CHART_INK.gridline, strokeWidth: 1 } },
    ticks: { line: { stroke: CHART_INK.gridline, strokeWidth: 1 }, text: { fill: CHART_INK.muted } },
    legend: { text: { fill: CHART_INK.primary } },
  },
  grid: { line: { stroke: CHART_INK.gridline, strokeWidth: 1 } },
  legends: { text: { fill: CHART_INK.primary } },
  tooltip: {
    container: {
      background: CHART_SURFACE,
      color: CHART_INK.primary,
      fontSize: 12,
      borderRadius: 8,
      border: `1px solid ${CHART_INK.gridline}`,
    },
  },
} as const;

/** The lineup read before it settles for the viewed season. */
export const OVERVIEW_LINEUP_LOADING_STATE: OverviewLineupState = { status: 'loading' };

/** Title of the Overview empty state shown while the season has no intake rows. */
export const OVERVIEW_EMPTY_TITLE = 'This season has no animes yet';

/** Guidance of the Overview empty state: where the season list comes from and what fills the overview. */
export const OVERVIEW_EMPTY_DESCRIPTION =
  'Paste the season list in Intake to start. The overview fills in as you evaluate, select and order.';

/** Label of the Overview empty state's action, which opens the Intake section. */
export const OVERVIEW_EMPTY_ACTION_LABEL = 'Start with Intake';
