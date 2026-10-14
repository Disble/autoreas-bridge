import type {
  EpisodeDurationRequest,
  EpisodeDurationRow,
  EpisodeDurationSection,
  EpisodeReanalysisProgress,
} from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../shared/contracts/anime.types';
import {
  EPISODE_DURATIONS_EMPTY_COPY,
  EPISODE_LONG_THRESHOLD_MS,
  EPISODE_MINUTE_MS,
  EPISODE_NOT_TV_NOTE,
  EPISODE_REANALYZE_LABEL,
  EPISODE_ROW_SOURCE_LABELS,
  EPISODE_TOTAL_UNKNOWN_NOTE,
} from './episode-durations-section.constants';
import type {
  EpisodeAddFormState,
  EpisodeAddFormView,
  EpisodeDurationRowView,
  EpisodeDurationsBanner,
  EpisodeDurationsLoad,
  EpisodeDurationsOverview,
  EpisodeDurationsSummary,
  EpisodeDurationsView,
  EpisodeEditFormState,
  EpisodeEditFormView,
  EpisodeReanalysisProgressView,
  EpisodeReanalyzeButtonView,
} from './episode-durations-section.types';

/** Parses a whole number above zero, the only episode number or minute count the section accepts. */
export function parsePositiveWholeNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value > 0 ? value : undefined;
}

/** Parses a whole number of zero or more, the shape of the draft's Total episodes and Type. */
function parseWholeNumber(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/**
 * Builds the section request from what the draft shows now, saved or not, so the
 * section follows unsaved edits of the folder, the total and the type. Nothing
 * is requested until a record is loaded.
 */
export function toEpisodeDurationRequest(animeId: string | undefined, folder: string, totalEpisodes: string, kind: string): EpisodeDurationRequest | undefined {
  if (animeId === undefined) return undefined;
  const total = parseWholeNumber(totalEpisodes);
  const type = parseWholeNumber(kind);
  return {
    animeId,
    folder: folder.trim(),
    ...(total === undefined ? {} : { totalEpisodes: total }),
    ...(type === undefined ? {} : { kind: type }),
  };
}

/** The message of a thrown binding failure, whatever was thrown. */
export function toEpisodeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Reads a section result as ready, or as a failure carrying its message. */
export function toEpisodeDurationsLoad(section: EpisodeDurationSection): EpisodeDurationsLoad {
  return section.outcome === 'ok'
    ? { status: 'ready', section }
    : { status: 'failed', message: section.message ?? 'Episode durations could not be read.' };
}

/** Rounds a runtime to whole minutes, like the backend's `lengths.WholeMinutes`. */
function wholeMinutes(durationMs: number): number {
  return Math.round(durationMs / EPISODE_MINUTE_MS);
}

/** Whether a stored row holds a value (a measured or manual source). */
function isStoredRow(row: EpisodeDurationRow | undefined): boolean {
  return row !== undefined && row.durationMs > 0;
}

/**
 * The source label of an unsaved manual value. It reads "no file yet" only when
 * the folder was found and the episode has no file there, the backend's own
 * `manual_no_file` rule.
 */
function manualLabel(base: EpisodeDurationRow | undefined, section: EpisodeDurationSection): string {
  const hasFile = base !== undefined && (base.source === 'measured' || base.source === 'manual' || base.source === 'not_measured_file_found');
  return section.folderStatus === 'found' && !hasFile ? EPISODE_ROW_SOURCE_LABELS.manual_no_file : EPISODE_ROW_SOURCE_LABELS.manual;
}

/** The edit modal's source line for a value set by a given writer, or for no value. */
function sourceLineOf(writer: 'measured' | 'manual' | undefined): string {
  if (writer === 'measured') return 'Measured from the file';
  if (writer === 'manual') return 'Set by hand';
  return 'Not measured yet';
}

/** Who wrote a stored row's value, read from its source. */
function storedWriter(row: EpisodeDurationRow): 'measured' | 'manual' | undefined {
  if (!isStoredRow(row)) return undefined;
  return row.source === 'measured' ? 'measured' : 'manual';
}

/** The parts every row view shares, whoever set its value. */
type RowViewBase = Pick<EpisodeDurationRowView, 'id' | 'episode' | 'number' | 'durationMs' | 'durationLabel' | 'hasDuration' | 'sourceLine' | 'editLabel'>;

/** The row view parts that follow from an episode, its duration and who set it. */
function toRowViewBase(episode: number, durationMs: number, writer: 'measured' | 'manual' | undefined): RowViewBase {
  const hasDuration = durationMs > 0;
  return {
    id: String(episode),
    episode,
    number: String(episode).padStart(2, '0'),
    durationMs,
    durationLabel: hasDuration ? `${wholeMinutes(durationMs)} min` : '—',
    hasDuration,
    sourceLine: sourceLineOf(writer),
    editLabel: `Edit episode ${episode} duration`,
  };
}

/** A stored row with no unsaved edit: it keeps the source and long mark the backend computed. */
function toStoredRowView(row: EpisodeDurationRow): EpisodeDurationRowView {
  return {
    ...toRowViewBase(row.episode, row.durationMs, storedWriter(row)),
    isStored: isStoredRow(row),
    isLong: row.long,
    isUnsaved: false,
    sourceLabel: EPISODE_ROW_SOURCE_LABELS[row.source],
  };
}

/** The source label of an unsaved edit, by who set its value. */
function editedSourceLabel(writer: 'measured' | 'manual' | undefined, base: EpisodeDurationRow | undefined, section: EpisodeDurationSection): string {
  if (writer === 'measured') return EPISODE_ROW_SOURCE_LABELS.measured;
  return writer === 'manual' ? manualLabel(base, section) : EPISODE_ROW_SOURCE_LABELS.not_measured;
}

/** The draft's unsaved edit applied over the stored row, when there is one. */
function toEditedRowView(edit: EpisodeDurationEdit, base: EpisodeDurationRow | undefined, section: EpisodeDurationSection): EpisodeDurationRowView {
  const durationMs = edit.clear ? 0 : edit.durationMs;
  const writer = edit.clear ? undefined : edit.source;
  return {
    ...toRowViewBase(edit.episode, durationMs, writer),
    isStored: isStoredRow(base),
    isLong: section.tv && durationMs > EPISODE_LONG_THRESHOLD_MS,
    isUnsaved: true,
    sourceLabel: editedSourceLabel(writer, base, section),
  };
}

/**
 * Merges the section's stored rows with the draft's unsaved edits, one row per
 * episode in ascending order. An edited row carries "Unsaved"; its long mark is
 * computed here with the backend's rule (TV only, strictly over 30 minutes),
 * while a stored row keeps the mark the backend computed.
 */
export function toEpisodeDurationRowViews(section: EpisodeDurationSection, edits: readonly EpisodeDurationEdit[]): readonly EpisodeDurationRowView[] {
  const stored = new Map(section.rows.map((row) => [row.episode, row]));
  const pending = new Map(edits.map((edit) => [edit.episode, edit]));
  const storedViews = [...stored.values()].filter((row) => !pending.has(row.episode)).map(toStoredRowView);
  const editedViews = [...pending.values()].map((edit) => toEditedRowView(edit, stored.get(edit.episode), section));
  return [...storedViews, ...editedViews].sort((left, right) => left.episode - right.episode);
}

/** The closed-trigger summary: "N of M measured", plus "N long" when an episode runs long. */
export function summarizeEpisodeDurations(rows: readonly EpisodeDurationRowView[]): EpisodeDurationsSummary {
  if (rows.length === 0) return { label: 'No episodes yet' };
  const measured = rows.filter((row) => row.hasDuration).length;
  const long = rows.filter((row) => row.isLong).length;
  return { label: `${measured} of ${rows.length} measured`, ...(long === 0 ? {} : { longLabel: `${long} long` }) };
}

/** Picks the one body the section renders; loading, failure, empty and table never coexist. */
export function classifyEpisodeDurationsView(load: EpisodeDurationsLoad, rows: readonly EpisodeDurationRowView[]): EpisodeDurationsView {
  if (load.status !== 'ready') return load.status;
  return rows.length === 0 ? 'empty' : 'table';
}

/** The banner naming the episodes found beyond Total episodes. */
function beyondTotalBanner(beyond: readonly number[], total: number | undefined): EpisodeDurationsBanner {
  const list = beyond.join(', ');
  const totalText = total === undefined ? 'unknown' : String(total);
  return beyond.length === 1
    ? { status: 'warning', title: `Episode ${list} is beyond the total`, description: `Total episodes is ${totalText}, but the folder has an episode ${list}. Update the total, or check the file.` }
    : { status: 'warning', title: `Episodes ${list} are beyond the total`, description: `Total episodes is ${totalText}, but the folder has episodes ${list}. Update the total, or check the files.` };
}

/** The one status alert of the state matrix (guide section 3), or nothing. */
export function toEpisodeDurationsBanner(section: EpisodeDurationSection, rows: readonly EpisodeDurationRowView[], request: EpisodeDurationRequest): EpisodeDurationsBanner | undefined {
  if (section.folderStatus === 'none') {
    return rows.length === 0 ? undefined : {
      status: 'accent', title: 'No folder set',
      description: 'Set the Folder field above to measure episodes automatically. You can still enter durations by hand.',
    };
  }
  if (section.folderStatus === 'missing') {
    return section.rows.some(isStoredRow)
      ? { status: 'accent', title: 'Showing saved durations', description: 'The folder is gone, which is normal once an anime is finished. Saved durations stay; re-analysis needs the folder.' }
      : { status: 'warning', title: 'Folder not found', description: `${request.folder} does not exist. Pick the folder again to measure episodes.` };
  }
  return section.beyondTotal.length === 0 ? undefined : beyondTotalBanner(section.beyondTotal, request.totalEpisodes);
}

/** The footer notes under a listed table: Total unknown, and long marks being TV only. */
export function toEpisodeDurationsNotes(section: EpisodeDurationSection, request: EpisodeDurationRequest, rows: readonly EpisodeDurationRowView[]): readonly string[] {
  if (rows.length === 0) return [];
  return [
    ...(request.totalEpisodes === undefined ? [EPISODE_TOTAL_UNKNOWN_NOTE] : []),
    ...(section.tv ? [] : [EPISODE_NOT_TV_NOTE]),
  ];
}

/** The banner and footer notes, which need both a read section and the draft's request. */
function toSectionNotices(
  section: EpisodeDurationSection | undefined,
  rows: readonly EpisodeDurationRowView[],
  request: EpisodeDurationRequest | undefined,
): Pick<EpisodeDurationsOverview, 'banner' | 'notes'> {
  if (section === undefined || request === undefined) return { banner: undefined, notes: [] };
  return { banner: toEpisodeDurationsBanner(section, rows, request), notes: toEpisodeDurationsNotes(section, request, rows) };
}

/**
 * Everything the section shows about its read: the exclusive body, the trigger
 * summary, the state matrix alert, the footer notes, the empty copy and the
 * failure message. Only a read section has a summary, an alert or notes.
 */
export function toEpisodeDurationsOverview(
  load: EpisodeDurationsLoad,
  rows: readonly EpisodeDurationRowView[],
  request: EpisodeDurationRequest | undefined,
): EpisodeDurationsOverview {
  const section = load.section;
  return {
    view: classifyEpisodeDurationsView(load, rows),
    summary: section === undefined ? undefined : summarizeEpisodeDurations(rows),
    ...toSectionNotices(section, rows, request),
    emptyCopy: section !== undefined && rows.length === 0 ? EPISODE_DURATIONS_EMPTY_COPY[section.folderStatus] : undefined,
    failureMessage: load.message,
    isTV: section?.tv === true,
  };
}

/** Why re-analysis cannot start now, or nothing when it can. */
function reanalyzeBlocker(load: EpisodeDurationsLoad, isRunning: boolean): string | undefined {
  if (isRunning) return 'Analyzing…';
  if (load.status !== 'ready') return undefined;
  if (load.section.folderStatus === 'none') return 'Set a folder first';
  return load.section.folderStatus === 'missing' ? 'Folder not found' : undefined;
}

/**
 * The icon-only re-analysis button. Its disabled reason lives in the accessible
 * name and the tooltip, because a disabled button gets no hover of its own.
 */
export function toEpisodeReanalyzeButton(load: EpisodeDurationsLoad, isRunning: boolean): EpisodeReanalyzeButtonView {
  const reason = reanalyzeBlocker(load, isRunning);
  return {
    isDisabled: isRunning || load.status !== 'ready' || reason !== undefined,
    ariaLabel: reason === undefined ? EPISODE_REANALYZE_LABEL : `${EPISODE_REANALYZE_LABEL} (${reason})`,
    tooltip: reason === undefined ? EPISODE_REANALYZE_LABEL : `${EPISODE_REANALYZE_LABEL} · ${reason}`,
  };
}

/** The progress line and bar of a running analysis; the bar counts the files already done. */
export function toEpisodeReanalysisProgressView(progress: EpisodeReanalysisProgress | undefined): EpisodeReanalysisProgressView {
  if (progress === undefined || progress.total <= 0) return { label: 'Measuring…', percent: 0 };
  return {
    label: `Measuring episode ${progress.episode} · ${progress.index} of ${progress.total}`,
    percent: Math.round(((progress.index - 1) / progress.total) * 100),
  };
}

/** Puts one edit into the draft, replacing an earlier edit of the same episode. */
export function upsertEpisodeEdit(edits: readonly EpisodeDurationEdit[], edit: EpisodeDurationEdit): readonly EpisodeDurationEdit[] {
  return [...edits.filter((current) => current.episode !== edit.episode), edit].sort((left, right) => left.episode - right.episode);
}

/**
 * Clears one episode's duration in the draft. A stored value gets a clear edit,
 * which deletes the row on Save; a value that only exists as an unsaved edit is
 * simply dropped from the draft.
 */
export function clearEpisodeDuration(edits: readonly EpisodeDurationEdit[], row: EpisodeDurationRowView): readonly EpisodeDurationEdit[] {
  return row.isStored
    ? upsertEpisodeEdit(edits, { episode: row.episode, durationMs: 0, source: 'manual', clear: true })
    : edits.filter((edit) => edit.episode !== row.episode);
}

/** The episode Add suggests: the one after the highest known episode, or 1. */
export function nextEpisodeNumber(rows: readonly EpisodeDurationRowView[]): number {
  return rows.reduce((highest, row) => Math.max(highest, row.episode), 0) + 1;
}

/** The add modal: its hint, the duplicate error, the long hint, and whether Add is allowed. */
export function toEpisodeAddFormView(form: EpisodeAddFormState, rows: readonly EpisodeDurationRowView[], isTV: boolean): EpisodeAddFormView {
  const episode = parsePositiveWholeNumber(form.episode);
  const minutes = parsePositiveWholeNumber(form.minutes);
  const duplicate = rows.find((row) => row.episode === episode && row.hasDuration);
  return {
    episode: form.episode,
    minutes: form.minutes,
    ...(rows.length === 0 ? {} : { episodeHint: `Next after episode ${nextEpisodeNumber(rows) - 1}` }),
    ...(duplicate === undefined ? {} : {
      duplicateMessage: `Episode ${duplicate.episode} already has ${wholeMinutes(duplicate.durationMs)} min.`,
      duplicateEpisode: duplicate.episode,
      editInsteadLabel: `Edit episode ${duplicate.episode} instead`,
    }),
    isLongHintVisible: isTV && (minutes ?? 0) * EPISODE_MINUTE_MS > EPISODE_LONG_THRESHOLD_MS,
    canAdd: episode !== undefined && minutes !== undefined && duplicate === undefined,
  };
}

/** The edit modal for one row. */
export function toEpisodeEditFormView(form: EpisodeEditFormState, row: EpisodeDurationRowView): EpisodeEditFormView {
  return {
    title: `Episode ${row.number} duration`,
    minutes: form.minutes,
    sourceLine: row.sourceLine,
    canApply: parsePositiveWholeNumber(form.minutes) !== undefined,
    canClear: row.hasDuration,
  };
}
