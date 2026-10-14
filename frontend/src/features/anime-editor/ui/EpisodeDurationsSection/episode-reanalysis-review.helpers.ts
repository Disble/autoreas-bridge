import type { EpisodeReanalysisReview, EpisodeReanalysisRow } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';
import { EPISODE_REANALYSIS_RESULT_VIEWS, EPISODE_SKIPPED_DETAIL_LABELS } from './episode-durations-section.constants';
import type { EpisodeChipColor, EpisodeOpenReview, EpisodeReviewChipView, EpisodeReviewRowView, EpisodeReviewView } from './episode-durations-section.types';

/** The view parts every review shares; each outcome fills in the rest. */
type ReviewHead = Pick<EpisodeReviewView, 'alertStatus' | 'title' | 'description'>;

/** A review before its dismiss variant, which follows from whether it offers to confirm. */
type ReviewContent = Omit<EpisodeReviewView, 'dismissVariant'>;

/** "1 change" or "3 changes". */
function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** How many rows of the review have each result. */
function countResults(rows: readonly EpisodeReanalysisRow[]): Readonly<Record<EpisodeReanalysisRow['result'], number>> {
  const counts = { unchanged: 0, update: 0, add: 0, manual_kept: 0, skipped: 0, unreadable: 0, not_reached: 0 };
  for (const row of rows) counts[row.result] += 1;
  return counts;
}

/** Whether a row is a change that confirming moves into the draft. */
function isChange(row: EpisodeReanalysisRow): boolean {
  return (row.result === 'update' || row.result === 'add') && row.measuredMs > 0;
}

/** What "Measured now" says for a file that gave no reading. */
function skippedReason(row: EpisodeReanalysisRow): string {
  if (row.result === 'unreadable') return 'could not read file';
  const known = Object.entries(EPISODE_SKIPPED_DETAIL_LABELS).find(([detail]) => detail === row.detail);
  if (known !== undefined) return known[1];
  return row.episode > 0 ? 'two files claim it' : 'no episode number';
}

/** One rendered review row. */
function toReviewRowView(row: EpisodeReanalysisRow, index: number): EpisodeReviewRowView {
  const noReading = row.result === 'skipped' || row.result === 'unreadable';
  return {
    id: `${index}-${row.episode}-${row.basename}`,
    number: row.episode > 0 ? String(row.episode).padStart(2, '0') : '—',
    current: row.currentMs > 0 ? `${row.currentMinutes} min${row.currentSource === 'manual' ? ' · manual' : ''}` : '—',
    measured: row.measuredMs > 0 ? `${row.measuredMinutes} min` : (noReading ? skippedReason(row) : '—'),
    result: EPISODE_REANALYSIS_RESULT_VIEWS[row.result] ?? { label: row.result, color: 'default' },
  };
}

/** The summary chips, in a fixed order, for the counts that are not zero; each label is unique, so it keys its chip. */
function toChips(entries: readonly (readonly [number, string, EpisodeChipColor])[]): readonly EpisodeReviewChipView[] {
  return entries.filter(([count]) => count > 0).map(([, label, color]) => ({ id: label, label, color }));
}

/** A review that ends with Close only and never offers to change anything. */
function closeOnly(folder: string, head: ReviewHead, rows: readonly EpisodeReanalysisRow[] = []): ReviewContent {
  return { folder, ...head, chips: [], rows: rows.map(toReviewRowView), canTryAgain: false, dismissLabel: 'Close' };
}

/** The review of a run that ended before measuring anything: no change can come out of it. */
function stoppedReview(open: EpisodeOpenReview): ReviewContent | undefined {
  const { review, folder } = open;
  const untouched = 'Saved durations were not touched.';
  if (review.outcome === 'busy') {
    return closeOnly(folder, { alertStatus: 'warning', title: 'A re-analysis is already running', description: 'Wait for it to finish, then try again.' });
  }
  if (review.outcome === 'error') {
    return closeOnly(folder, { alertStatus: 'danger', title: 'The folder could not be analyzed', description: review.message ?? untouched });
  }
  switch (review.status) {
    case 'probe_unavailable':
      return closeOnly(folder, { alertStatus: 'danger', title: 'Duration reader not available', description: 'Bridge needs ffprobe to read durations, and it was not found on this PC. Saved durations were not touched; you can still set them by hand.' });
    case 'no_folder':
      return closeOnly(folder, { alertStatus: 'warning', title: 'No folder set', description: `Set the Folder field to re-analyze. ${untouched}` });
    case 'folder_missing':
      return closeOnly(folder, { alertStatus: 'warning', title: 'Folder not found', description: `The folder does not exist. ${untouched}` });
    case 'no_files':
      return closeOnly(folder, { alertStatus: 'warning', title: 'No episode files recognized', description: `The folder exists, but no video file in it could be matched to an episode number. ${untouched}` }, review.rows);
  }
  return undefined;
}

/** The review of an analysis the folder interrupted: apply what was measured, or try again. */
function interruptedReview(open: EpisodeOpenReview, changes: number): ReviewContent {
  const rows = open.review.rows;
  const counts = countResults(rows);
  const measured = rows.filter((row) => row.measuredMs > 0);
  const last = measured.at(-1);
  return {
    folder: open.folder,
    alertStatus: 'warning',
    title: last === undefined ? 'The folder stopped responding' : `The folder stopped responding after episode ${last.episode}`,
    description: 'Episodes that were not reached keep their current values. You can apply what was measured, or try again.',
    chips: toChips([
      [measured.length, `${measured.length} measured`, 'success'],
      [changes, plural(changes, 'change'), 'accent'],
      [counts.not_reached, `${counts.not_reached} not reached`, 'default'],
    ]),
    rows: rows.map(toReviewRowView),
    ...(changes === 0 ? {} : { confirmLabel: `Apply ${plural(changes, 'change')}` }),
    canTryAgain: true,
    dismissLabel: 'Cancel',
  };
}

/** The headline of a completed analysis. */
function completedHead(review: EpisodeReanalysisReview, skipped: number): ReviewHead {
  if (skipped > 0) {
    const measured = review.rows.filter((row) => row.measuredMs > 0).length;
    return { alertStatus: 'warning', title: `${measured} of ${review.rows.length} episodes measured`, description: 'Skipped files keep their saved duration. Fix them and re-analyze, or set the duration by hand.' };
  }
  return { alertStatus: 'success', title: `Folder found · ${plural(review.filesRecognized, 'episode file')} recognized`, description: 'Review the differences below. Nothing is saved until you confirm.' };
}

/** The review content of any outcome: stopped, interrupted or completed. */
function toReviewContent(open: EpisodeOpenReview): ReviewContent {
  const stopped = stoppedReview(open);
  if (stopped !== undefined) return stopped;
  const { review } = open;
  const counts = countResults(review.rows);
  const changes = review.rows.filter(isChange).length;
  if (review.status === 'interrupted') return interruptedReview(open, changes);
  const skipped = counts.skipped + counts.unreadable;
  if (changes === 0 && skipped === 0 && counts.manual_kept === 0) {
    const measured = review.rows.filter((row) => row.measuredMs > 0).length;
    return closeOnly(open.folder, { alertStatus: 'success', title: 'Everything is up to date', description: `${plural(measured, 'episode')} measured. No duration differs from what is saved.` });
  }
  return {
    folder: open.folder,
    ...completedHead(review, skipped),
    chips: toChips([
      [counts.update, plural(counts.update, 'change'), 'accent'],
      [counts.add, `${counts.add} new`, 'success'],
      [counts.manual_kept, `${counts.manual_kept} manual kept`, 'warning'],
      [counts.skipped, `${counts.skipped} skipped`, 'default'],
      [counts.unreadable, `${counts.unreadable} unreadable`, 'danger'],
      [counts.unchanged, `${counts.unchanged} unchanged`, 'default'],
    ]),
    rows: review.rows.map(toReviewRowView),
    ...(changes === 0 ? {} : { confirmLabel: `Confirm ${plural(changes, 'change')}` }),
    canTryAgain: false,
    dismissLabel: changes === 0 ? 'Close' : 'Cancel',
  };
}

/**
 * Turns a re-analysis result into its review modal (guide section 4): the
 * status alert, the summary chips, the rows, and which actions it offers.
 * Re-analysis never writes; confirming only moves the changes into the draft.
 */
export function toEpisodeReviewView(open: EpisodeOpenReview): EpisodeReviewView {
  const content = toReviewContent(open);
  return { ...content, dismissVariant: content.confirmLabel === undefined ? 'primary' : 'tertiary' };
}

/**
 * Moves the review's changes into the draft (Log L15): every update and add
 * becomes a measured edit, replacing an earlier edit of the same episode.
 * Manual-kept rows are never moved, and an unsaved manual value is never
 * replaced by a reading, the same rule the backend applies to stored values.
 */
export function toEpisodeReviewEdits(review: EpisodeReanalysisReview, edits: readonly EpisodeDurationEdit[]): readonly EpisodeDurationEdit[] {
  const pendingManual = new Set(edits.filter((edit) => edit.source === 'manual' && !edit.clear).map((edit) => edit.episode));
  const incoming: readonly EpisodeDurationEdit[] = review.rows
    .filter((row) => isChange(row) && !pendingManual.has(row.episode))
    .map((row) => ({ episode: row.episode, durationMs: row.measuredMs, source: 'measured', clear: false }));
  const replaced = new Set(incoming.map((edit) => edit.episode));
  return [...edits.filter((edit) => !replaced.has(edit.episode)), ...incoming].sort((left, right) => left.episode - right.episode);
}

/** Whether a finished re-analysis opens the review; one the user cancelled closes quietly. */
export function shouldOpenEpisodeReview(review: EpisodeReanalysisReview): boolean {
  return !(review.outcome === 'ok' && review.status === 'cancelled');
}
