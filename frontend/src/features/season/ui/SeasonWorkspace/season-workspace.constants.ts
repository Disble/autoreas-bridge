import type { SeasonOverview } from './season-workspace.types';

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

/**
 * Route-tab contract for the Season Workspace sections shown in the shell.
 */
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
  { id: 'intake', label: 'Intake & Daily', available: true },
  { id: 'evaluation', label: 'Evaluation', available: true },
  { id: 'selection', label: 'Selection', available: true },
  { id: 'ordering', label: 'Ordering', available: true },
];

/** Page heading for the Season Workspace route. Must equal the nav item label exactly. */
export const SEASON_WORKSPACE_TITLE = 'Season';
/** Empty-state title shown when no season is open. */
export const SEASON_WORKSPACE_EMPTY_TITLE = 'No open season';
/** Empty-state helper message shown alongside the create-season form. */
export const SEASON_WORKSPACE_EMPTY_MESSAGE = 'Create a season to start the selection workflow.';
/** Explains, beside Close season, that season mode is derived from the open season (SDD-41b). */
export const SEASON_WORKSPACE_SEASON_MODE_MESSAGE = 'Season mode stays on until you close the season.';
/** The muted line beside a past season's Closed chip. */
export const SEASON_WORKSPACE_READ_ONLY_MESSAGE = 'Read-only — editing is disabled.';

/** The season facts the open season's Overview card lists, in order, by overview field. */
export const SEASON_OVERVIEW_FACTS = [
  { label: 'Created', field: 'createdLabel' },
  { label: 'Minimum approval grade', field: 'minApprovalGrade' },
  { label: 'Slots', field: 'slots' },
] as const satisfies readonly { readonly label: string; readonly field: keyof SeasonOverview }[];
