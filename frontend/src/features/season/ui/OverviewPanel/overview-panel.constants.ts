/**
 * Literal hex chart palette + nivo theme for OverviewPanel. nivo cannot consume
 * Tailwind classes or HeroUI `color` props — it needs literal color strings.
 * Every value here is documented in `.claude/skills/autoreas-theme/SKILL.md`
 * ("Chart palette (nivo, literal hex)"); keep the two in sync.
 */

/** The HeroUI dark Card surface (`--surface`), the background every chart sits on. */
export const CHART_SURFACE = '#18181B';

/** Chart chrome ink, sourced from the HeroUI dark tokens actually in effect. */
export const CHART_INK = {
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

/** Empty-state copy for the watching pipeline chart when there are no created animes yet. */
export const PIPELINE_EMPTY_MESSAGE = 'No created animes yet — the pipeline fills as animes are created.';
/** Empty-state copy for the intake health chart when there are no intake rows yet. */
export const INTAKE_HEALTH_EMPTY_MESSAGE = 'No intake rows yet.';
/** Empty-state copy for the grade histogram when there are no graded animes yet. */
export const GRADE_HISTOGRAM_EMPTY_MESSAGE = 'No graded animes yet — the histogram fills in as animes are rated.';

/** Short chart wrapper height (one-row stacked bars), including their axis band. */
export const CHART_HEIGHT_SHORT = 'h-[140px]';
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
