import type { IntakeMetadataPatch } from './intake-panel.types';

/** Readable labels for each intake match status. */
export const MATCH_STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: 'Pending',
  matched: 'Matched',
  ambiguous: 'Ambiguous',
  not_found: 'Not found',
  discarded: 'Discarded',
};

/** Placeholder for the intake paste textarea. */
export const INTAKE_PASTE_PLACEHOLDER = 'One anime name per line…';
/** Heading shown when the intake list has no rows. */
export const INTAKE_EMPTY_TITLE = 'No intake rows yet';
/** Guidance shown while the intake list is empty. */
export const INTAKE_EMPTY_DESCRIPTION = 'Paste the season list to start planning this season.';
/** Recovery action label shown while the intake list is empty. */
export const INTAKE_EMPTY_ACTION_LABEL = 'Paste list';
/** Debounce (ms) before a raw-text edit reconciles into the intake rows. */
export const INTAKE_RECONCILE_DEBOUNCE_MS = 600;
/** Native folder-picker dialog title for a per-anime download folder override. */
export const INTAKE_FOLDER_PICKER_TITLE = 'Choose download folder for this anime';
/**
 * Readable labels for the metadata fields a confirmed MyAnimeList lookup can
 * attach to an intake row, used by the row's one-line applied summary. Typed by
 * `keyof IntakeMetadataPatch` on purpose: a new field on the held metadata
 * cannot be added without also deciding how the row words it.
 */
export const INTAKE_METADATA_FIELD_LABELS: Readonly<Record<keyof IntakeMetadataPatch, string>> = {
  name: 'Name',
  kind: 'Type',
  totalEpisodes: 'Episodes',
  duration: 'Duration',
  origin: 'Origin',
  genres: 'Genres',
  studios: 'Studios',
  coverURL: 'Cover',
};
