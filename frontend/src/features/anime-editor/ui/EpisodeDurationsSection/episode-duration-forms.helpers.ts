import type { EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';
import { EPISODE_MINUTE_MS } from './episode-durations-section.constants';
import { parsePositiveWholeNumber, toEpisodeEditFormView } from './episode-durations-section.helpers';
import type { EpisodeAddFormState, EpisodeAddFormView, EpisodeDurationRowView, EpisodeEditFormState, EpisodeOpenEdit } from './episode-durations-section.types';

/** A hand-set value for one episode, in whole minutes. */
function toManualEdit(episode: number, minutes: number): EpisodeDurationEdit {
  return { episode, durationMs: minutes * EPISODE_MINUTE_MS, source: 'manual', clear: false };
}

/** The edit modal as it opens on one episode: prefilled with its whole minutes, or empty when it has no value. */
export function toEpisodeEditForm(rows: readonly EpisodeDurationRowView[], episode: number): EpisodeEditFormState {
  const row = rows.find((candidate) => candidate.episode === episode);
  return { episode, minutes: row === undefined || !row.hasDuration ? '' : String(Math.round(row.durationMs / EPISODE_MINUTE_MS)) };
}

/** The open edit modal's row and view, or nothing while it is closed or its episode is no longer listed. */
export function toEpisodeOpenEdit(form: EpisodeEditFormState | undefined, rows: readonly EpisodeDurationRowView[]): EpisodeOpenEdit | undefined {
  if (form === undefined) return undefined;
  const row = rows.find((candidate) => candidate.episode === form.episode);
  return row === undefined ? undefined : { row, view: toEpisodeEditFormView(form, row) };
}

/** Applies one typed field to an open form; a closed form stays closed. */
export function patchEpisodeForm<Form extends object>(current: Form | undefined, patch: Partial<Form>): Form | undefined {
  return current === undefined ? undefined : { ...current, ...patch };
}

/** The manual edit Apply puts into the draft, or nothing while no whole number of minutes above zero is typed. */
export function toAppliedEpisodeEdit(form: EpisodeEditFormState | undefined): EpisodeDurationEdit | undefined {
  if (form === undefined) return undefined;
  const minutes = parsePositiveWholeNumber(form.minutes);
  return minutes === undefined ? undefined : toManualEdit(form.episode, minutes);
}

/** The manual edit Add puts into the draft, or nothing while the add modal does not allow it. */
export function toAddedEpisodeEdit(form: EpisodeAddFormState | undefined, view: EpisodeAddFormView | undefined): EpisodeDurationEdit | undefined {
  if (form === undefined || view?.canAdd !== true) return undefined;
  return toManualEdit(Number(form.episode), Number(form.minutes));
}
