/**
 * Spanish month names, used to derive the suggested season name (the Excel-sheet
 * naming convention, e.g. "Julio 2026"). These are data literals, not UI copy.
 */
export const SEASON_MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Section identifiers for the Season Workspace tab shell. */
export type SeasonSectionId = 'overview' | 'intake' | 'daily' | 'evaluation' | 'selection' | 'ordering';

export interface SeasonSectionTab {
  readonly id: SeasonSectionId;
  readonly label: string;
  /** Whether the section ships in the current slice; upcoming sections render a placeholder. */
  readonly available: boolean;
}

/**
 * The workspace sections. Overview ships in SDD-41; the workflow sections arrive
 * with their own slices (intake→SDD-42, daily→SDD-43, evaluation→SDD-44,
 * selection→SDD-45, ordering→SDD-46) and render a placeholder until then.
 */
export const SEASON_SECTION_TABS: readonly SeasonSectionTab[] = [
  { id: 'overview', label: 'Overview', available: true },
  { id: 'intake', label: 'Intake & Matching', available: true },
  { id: 'daily', label: 'Daily Board', available: true },
  { id: 'evaluation', label: 'Evaluation', available: true },
  { id: 'selection', label: 'Selection', available: true },
  { id: 'ordering', label: 'Ordering', available: false },
];

/** Page heading for the Season Workspace route. */
export const SEASON_WORKSPACE_TITLE = 'Season Workspace';
/** Empty-state title shown when no season is open. */
export const SEASON_WORKSPACE_EMPTY_TITLE = 'No open season';
/** Empty-state helper message shown alongside the create-season form. */
export const SEASON_WORKSPACE_EMPTY_MESSAGE = 'Create a season to start the selection workflow.';
/** Placeholder shown under the Overview for workflow sections not yet shipped. */
export const SEASON_WORKSPACE_UPCOMING_MESSAGE = 'This section arrives in an upcoming slice.';
/** Explains that season mode is derived from the open season (SDD-41b). */
export const SEASON_WORKSPACE_SEASON_MODE_MESSAGE =
  'Season mode is active while this season is open. Closing the season turns it off.';
