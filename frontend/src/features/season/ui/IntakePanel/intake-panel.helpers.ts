import type { SeasonAnimeCandidate, SeasonAnimeRow, SeasonCreateMetadata } from '../../../../infrastructure/season-source/season-source.types';
import type { AnimeMetadataSelection } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import { getAnimeTipoLabel } from '../../../../shared/helpers/anime-tipo.helpers';
import { INTAKE_METADATA_FIELD_LABELS, MATCH_STATUS_LABELS } from './intake-panel.constants';
import type { IntakeChipColor, IntakeMetadataPatch } from './intake-panel.types';

/**
 * Strips trailing dots and spaces, which Windows silently drops from a folder
 * name. Duplicated from `shared/helpers/download-folder.helpers.ts` on purpose
 * for now: both mirror the backend `sanitizeFolderName`, and merging them would
 * make this feature depend on the shared copy's evolution.
 * @param value Candidate folder-name segment.
 * @returns The segment with trailing `.` and ` ` removed.
 */
function trimTrailingWindowsNameCharacters(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '.' || value[end - 1] === ' ')) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Removes trailing path separators so joining a root with a segment cannot
 * produce a doubled slash.
 * @param value Candidate path root.
 * @returns The root without trailing `/` or `\`.
 */
function trimTrailingPathSeparators(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '/' || value[end - 1] === '\\')) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Returns a readable label for an intake match status, falling back to the raw
 * value for any unrecognized status.
 */
export function getMatchStatusLabel(status: string): string {
  return MATCH_STATUS_LABELS[status] ?? status;
}

/**
 * Semantic chip color per match status: matched=success, ambiguous=warning,
 * not_found=danger, everything else neutral.
 */
export function getMatchStatusColor(status: string): IntakeChipColor {
  switch (status) {
    case 'matched':
      return 'success';
    case 'ambiguous':
      return 'warning';
    case 'not_found':
      return 'danger';
    default:
      return 'default';
  }
}

/**
 * Formats a candidate as a pickable option: its title plus its similarity score
 * as a rounded percentage.
 */
export function formatCandidateOption(candidate: SeasonAnimeCandidate): string {
  return `${candidate.title} (${Math.round(candidate.score * 100)}%)`;
}

/**
 * Counts intake rows still needing attention (pending or ambiguous), used to
 * surface how much of the list is unresolved.
 */
export function countUnresolved(rows: readonly SeasonAnimeRow[]): number {
  return rows.filter((row) => row.matchStatus === 'pending' || row.matchStatus === 'ambiguous').length;
}

/**
 * Counts matched rows that are blocked only by the availability probe. These
 * rows are valid matches, but creation stays disabled until the app verifies
 * that episode 1 is online.
 */
export function countMatchedWaitingForAvailability(rows: readonly SeasonAnimeRow[]): number {
  return rows.filter((row) => row.matchStatus === 'matched' && row.availability === 'waiting').length;
}

/**
 * Mirrors the backend's default season download-folder derivation so the UI can
 * preview the exact folder that creation will request: downloads root plus a
 * Windows-safe anime-name segment.
 */
export function deriveIntakeDownloadFolder(root: string, name: string): string {
  if (root === '') {
    return '';
  }
  const segment = name
    // Control-char range is deliberate: mirrors the backend sanitizeFolderName control-char strip (internal/season/folder.go), not an accidental range.
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  const sanitizedSegment = trimTrailingWindowsNameCharacters(segment);
  if (sanitizedSegment === '') {
    return '';
  }
  const separator = root.includes('\\') ? '\\' : '/';
  return `${trimTrailingPathSeparators(root)}${separator}${sanitizedSegment}`;
}

/**
 * An intake row is EDITABLE (part of the raw text) only while it is still just a
 * name: not yet created and not discarded. Created rows have a real anime record
 * and graduate out of the freely-editable raw document.
 */
function isEditableRow(row: SeasonAnimeRow): boolean {
  return row.availability !== 'created' && row.matchStatus !== 'discarded';
}

/**
 * A matched row is CREATABLE once its episode 1 is online (availability
 * 'available'). Creation is an explicit, user-picked action — the availability
 * watch never creates on its own.
 */
export function isCreatableRow(row: SeasonAnimeRow): boolean {
  return row.matchStatus === 'matched' && row.availability === 'available';
}

/**
 * The availability indicator for a matched row: 'success' (green) once it can be
 * created, 'danger' (red) while its first episode is not online yet. Returns null
 * for rows still being matched (their match-status chip conveys their state).
 */
export function getAvailabilityIndicator(row: SeasonAnimeRow): { color: 'success' | 'danger'; label: string } | null {
  if (row.matchStatus !== 'matched') {
    return null;
  }
  return row.availability === 'available'
    ? { color: 'success', label: 'Available to create' }
    : { color: 'danger', label: 'Waiting for episode 1' };
}

/**
 * Builds the raw editor text from the editable (uncreated, non-discarded) rows:
 * one name per line. Created rows are never part of the raw document.
 */
export function buildRawText(rows: readonly SeasonAnimeRow[]): string {
  const names: string[] = [];
  for (const row of rows) {
    if (isEditableRow(row)) {
      names.push(row.rawName);
    }
  }
  return names.join('\n');
}

/**
 * Splits intake rows for the List view: editable rows (still names) and created
 * rows (read-only, shown for the global picture). Discarded rows are dropped.
 */
export function splitIntakeRows(rows: readonly SeasonAnimeRow[]): {
  editable: readonly SeasonAnimeRow[];
  created: readonly SeasonAnimeRow[];
} {
  const editable: SeasonAnimeRow[] = [];
  const created: SeasonAnimeRow[] = [];
  for (const row of rows) {
    if (row.availability === 'created') {
      created.push(row);
    } else if (row.matchStatus !== 'discarded') {
      editable.push(row);
    }
  }
  return { editable, created };
}

/**
 * Reads the user's folder override for one row. An absent key and an empty
 * string mean the same thing to every caller — "no override" — so both collapse
 * to `''` here rather than being re-tested at each call site.
 * @param overrides Row id -> folder chosen through the picker.
 * @param rowId Row to read.
 * @returns The override, or `''` when the row has none.
 */
function resolveFolderOverride(overrides: Readonly<Record<string, string>>, rowId: string): string {
  if (!Object.hasOwn(overrides, rowId)) {
    return '';
  }
  return overrides[rowId] ?? '';
}

/**
 * Narrows folder overrides to the ids being created, dropping the ones with no
 * choice behind them. The backend derives its own default for any id absent
 * from the result, so sending an empty string would override that default with
 * nothing.
 * @param ids Row ids selected for creation.
 * @param overrides Row id -> folder chosen through the picker.
 * @returns Row id -> non-empty folder, for the given ids only.
 */
export function collectFolderOverrides(
  ids: readonly string[],
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const folders: Record<string, string> = {};
  for (const id of ids) {
    const override = resolveFolderOverride(overrides, id);
    if (override !== '') {
      folders[id] = override;
    }
  }
  return folders;
}

/**
 * Builds the folder shown under each editable row: the user's override when
 * there is one, otherwise the same default the backend would derive. A row
 * appears in the result only when one of the two resolves, so the UI shows no
 * preview rather than an empty one.
 * @param downloadsRoot Configured downloads root; `''` disables defaults.
 * @param rows Editable intake rows.
 * @param overrides Row id -> folder chosen through the picker.
 * @returns Row id -> folder to preview.
 */
export function buildFolderPreviews(
  downloadsRoot: string,
  rows: readonly SeasonAnimeRow[],
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const previews: Record<string, string> = {};
  for (const row of rows) {
    const preview = resolveFolderOverride(overrides, row.id) || deriveIntakeDownloadFolder(downloadsRoot, row.rawName);
    if (preview !== '') {
      previews[row.id] = preview;
    }
  }
  return previews;
}

/**
 * Flips one row's membership in the creation selection, returning a new set so
 * React sees a changed reference.
 * @param selected Current selection.
 * @param rowId Row to add or remove.
 * @returns A new set with `rowId` toggled.
 */
export function toggleSelection(selected: ReadonlySet<string>, rowId: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(rowId)) {
    next.delete(rowId);
  } else {
    next.add(rowId);
  }
  return next;
}

/**
 * Performs hop two of the MAL-to-bridge translation for ONE intake row: turns a
 * confirmed lookup's neutral {@link AnimeMetadataSelection} into the metadata
 * that row holds. Every field is read from an explicit allow-list, exactly as
 * the Create row's own mapper does, so the intake row's protected fields --
 * download page, download folder, watched episodes, estado, first-watch date --
 * have no code path into the result at all. The result is neither persisted nor
 * sent to creation in this slice; it is only shown back to the user.
 * @param selection The confirmed lookup's normalized, source-agnostic result.
 * @returns The row's held metadata, holding only the fields `selection` mapped.
 */
export function toIntakeMetadataPatch(selection: Readonly<AnimeMetadataSelection>): IntakeMetadataPatch {
  return {
    name: selection.name,
    ...(selection.kind === undefined ? {} : { kind: selection.kind }),
    ...(selection.totalEpisodes === undefined ? {} : { totalEpisodes: selection.totalEpisodes }),
    ...(selection.duration === undefined ? {} : { duration: selection.duration }),
    ...(selection.origin === undefined ? {} : { origin: selection.origin }),
    ...(selection.genres === undefined ? {} : { genres: selection.genres }),
    ...(selection.studios === undefined ? {} : { studios: selection.studios }),
    ...(selection.coverURL === undefined ? {} : { coverURL: selection.coverURL }),
  };
}

/**
 * Converts one row's held metadata into the shape the Go side accepts: numbers
 * become numbers, the comma-joined lists become lists, and the held cover URL
 * becomes the canonical typed cover. A value the row does not hold, or one that
 * does not parse, is simply absent — the created anime then keeps the value it
 * would have had with no metadata at all. The confirmed title does not travel:
 * the row's raw name is the name the user typed, so it wins.
 * @param held The row's held metadata patch.
 * @returns The same metadata in the create contract's shape.
 */
export function toSeasonCreateMetadata(held: Readonly<IntakeMetadataPatch>): SeasonCreateMetadata {
  const kind = parseOptionalWholeNumber(held.kind);
  const totalEpisodes = parseOptionalWholeNumber(held.totalEpisodes);
  const durationMinutes = parseOptionalWholeNumber(held.duration);
  const genres = splitMetadataList(held.genres);
  const studios = splitMetadataList(held.studios);
  return {
    ...(kind === undefined ? {} : { kind }),
    ...(totalEpisodes === undefined ? {} : { totalEpisodes }),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
    ...(held.origin === undefined || held.origin === '' ? {} : { origin: held.origin }),
    ...(genres === undefined ? {} : { genres }),
    ...(studios === undefined ? {} : { studios }),
    ...(held.coverURL === undefined || held.coverURL === '' ? {} : { cover: { type: 'url', path: held.coverURL } }),
  };
}

/**
 * Converts only the rows that are about to be created, so a lookup attached to a
 * row the user did not select never travels with the batch.
 * @param byRow Every row's held metadata, keyed by row id.
 * @param rowIds The rows this creation will create.
 * @returns The create metadata for exactly those rows.
 */
export function buildSeasonCreateMetadata(
  byRow: Readonly<Record<string, IntakeMetadataPatch>>,
  rowIds: readonly string[],
): Readonly<Record<string, SeasonCreateMetadata>> {
  const out: Record<string, SeasonCreateMetadata> = {};
  for (const rowId of rowIds) {
    const held = byRow[rowId];
    if (held !== undefined) {
      out[rowId] = toSeasonCreateMetadata(held);
    }
  }
  return out;
}

/**
 * Parses a whole number out of an input string, treating a blank or non-numeric
 * value as absent rather than as zero.
 * @param value The input string a lookup filled, or undefined.
 * @returns The parsed whole number, or undefined when there is nothing to parse.
 */
function parseOptionalWholeNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

/**
 * Splits a lookup's comma-joined list into its entries, treating a blank value as
 * absent so an unconfirmed list never reaches the create contract as an empty one.
 * @param value The comma-joined list a lookup filled, or undefined.
 * @returns The trimmed entries, or undefined when there are none.
 */
function splitMetadataList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return entries.length === 0 ? undefined : entries;
}

/**
 * Drops the blank entries of a held metadata patch, so a row that lost every
 * value (an undo back to nothing, or a lookup that confirmed only blanks) holds
 * nothing at all instead of a record of empty fields.
 * @param patch The held metadata patch.
 * @returns The patch without its blank entries.
 */
export function compactMetadataPatch(patch: Readonly<IntakeMetadataPatch>): IntakeMetadataPatch {
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value !== undefined && value !== '') {
      out[field] = value;
    }
  }
  return out as IntakeMetadataPatch;
}

/**
 * Turns a row's STORED metadata back into the display patch the row holds, so a
 * choice confirmed before the panel was last closed reappears with the same
 * values. It is the exact inverse of {@link toSeasonCreateMetadata}: numbers
 * become the strings the panel shows, the lists become comma-joined text, and the
 * typed cover becomes its URL. A field the stored record does not carry stays
 * absent, so "not recorded" never becomes an empty value.
 * @param stored The row's stored metadata, or undefined when it has none.
 * @returns The display patch for that row, or undefined when nothing is stored.
 */
export function toHeldMetadataPatch(stored: SeasonCreateMetadata | undefined): IntakeMetadataPatch | undefined {
  if (stored === undefined) {
    return undefined;
  }
  return {
    ...(stored.kind === undefined ? {} : { kind: String(stored.kind) }),
    ...(stored.totalEpisodes === undefined ? {} : { totalEpisodes: String(stored.totalEpisodes) }),
    ...(stored.durationMinutes === undefined ? {} : { duration: String(stored.durationMinutes) }),
    ...(stored.origin === undefined || stored.origin === '' ? {} : { origin: stored.origin }),
    ...(stored.genres === undefined ? {} : { genres: stored.genres.join(', ') }),
    ...(stored.studios === undefined ? {} : { studios: stored.studios.join(', ') }),
    ...(stored.cover === undefined || stored.cover.path === '' ? {} : { coverURL: stored.cover.path }),
  };
}

/**
 * Summarizes a row's held metadata as the one muted line under its name:
 * kind, episode count, minutes per episode and studios, in that order, each
 * only when held. The kind reads as its label, or as its raw value when the
 * label is unknown.
 * @param patch The row's held metadata.
 * @returns The " · "-joined summary, or `''` when none of the four is held.
 */
export function formatMetadataSummary(patch: Readonly<IntakeMetadataPatch>): string {
  const parts: readonly { value: string | undefined; format: (value: string) => string }[] = [
    { value: patch.kind, format: (kind) => getAnimeTipoLabel(Number(kind)) },
    { value: patch.totalEpisodes, format: (episodes) => `${episodes} eps` },
    { value: patch.duration, format: (minutes) => `${minutes} min` },
    { value: patch.studios, format: (studios) => studios },
  ];
  return parts
    .flatMap(({ value, format }) => (value === undefined || value === '' ? [] : [format(value)]))
    .join(' · ');
}

/**
 * Renders an applied patch's field labels as the row's one-line summary, so the
 * user can read WHICH metadata a lookup attached without the row reprinting
 * every value under it.
 * @param appliedFields The patch's own field names, in the order they were applied.
 * @returns Those fields' readable labels joined by ", ".
 */
export function formatAppliedMetadataFields(appliedFields: readonly (keyof IntakeMetadataPatch)[]): string {
  return appliedFields.map((field) => INTAKE_METADATA_FIELD_LABELS[field]).join(', ');
}

/**
 * Narrows a row-keyed record of held values (a row's metadata, a row's applied
 * patch) to the rows the intake list still shows, so one row's lookup result
 * cannot outlive the row it belongs to. Reordering rows and an unrelated store
 * refresh change no id: this returns `byRow` itself in that case rather than a
 * fresh copy, so a refresh with the same rows does not churn the record.
 * @param byRow Row id -> stored value.
 * @param rowIds The row ids the intake list currently shows.
 * @returns `byRow` when every stored row is still shown, else the narrowed copy.
 */
export function pickRowEntries<TValue>(
  byRow: Readonly<Record<string, TValue>>,
  rowIds: ReadonlySet<string>,
): Readonly<Record<string, TValue>> {
  const kept: Record<string, TValue> = {};
  for (const [rowId, value] of Object.entries(byRow)) {
    if (rowIds.has(rowId)) {
      kept[rowId] = value;
    }
  }
  return Object.keys(kept).length === Object.keys(byRow).length ? byRow : kept;
}
