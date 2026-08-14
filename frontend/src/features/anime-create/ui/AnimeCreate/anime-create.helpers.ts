import { ANIME_SCHEDULE_DRAFT_ID_PREFIX } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';
import type { AnimeCreateCommand, AnimeCreateItem, AnimeCreatePlacement, ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { deriveDownloadFolder } from '../../../../shared/helpers/download-folder.helpers';
import { isValidDownloadPageUrl } from '../../../../shared/helpers/url.helpers';
import { ANIME_CREATE_DEFAULT_KIND, ANIME_CREATE_UNSET_FIELD } from './anime-create.constants';
import type { AnimeCreateRowDraft, AnimeCreateRowPatch } from './anime-create.types';

/**
 * Creates one empty batch-create row with a stable synthetic draft id, ready
 * to be seeded onto the shared schedule board as a draggable staging card.
 */
export function createAnimeCreateRow(index: number): AnimeCreateRowDraft {
  return {
    draftId: `${ANIME_SCHEDULE_DRAFT_ID_PREFIX}${index}`,
    name: '',
    page: '',
    folder: ANIME_CREATE_UNSET_FIELD,
    folderManual: false,
    kind: ANIME_CREATE_DEFAULT_KIND,
    episodesWatched: ANIME_CREATE_UNSET_FIELD,
    totalEpisodes: ANIME_CREATE_UNSET_FIELD,
    duration: ANIME_CREATE_UNSET_FIELD,
    origin: ANIME_CREATE_UNSET_FIELD,
    coverType: 'url',
    coverPath: ANIME_CREATE_UNSET_FIELD,
    genres: ANIME_CREATE_UNSET_FIELD,
    studios: ANIME_CREATE_UNSET_FIELD,
  };
}

/**
 * Returns the download-page field description, switching to a corrective hint
 * when the value is present but not a valid http(s) URL.
 */
export function downloadPageDescription(page: string): string {
  if (page.trim() !== '' && !isValidDownloadPageUrl(page)) {
    return 'Enter a valid URL starting with http:// or https://';
  }
  return 'Public URL where new episodes are published.';
}

/** Parses an optional integer input, returning `undefined` for blank/invalid. */
export function parseOptionalCreateInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

/** Splits a comma-separated input into trimmed, non-empty entries. */
export function splitCreateCommaList(value: string): readonly string[] {
  return value.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
}

/**
 * Applies a picked folder path to one row, leaving every other row untouched.
 * A blank/cancelled pick (empty trimmed string) is a no-op.
 */
export function applyRowFolder(
  rows: readonly AnimeCreateRowDraft[],
  draftId: string,
  folder: string,
): readonly AnimeCreateRowDraft[] {
  if (folder.trim() === '') {
    return rows;
  }
  return rows.map((row) => (row.draftId === draftId ? { ...row, folder, folderManual: true } : row));
}

/**
 * Applies a field patch to one row. Editing the folder marks it manual (and an
 * emptied folder reverts to auto). While the folder is still auto, a name edit
 * re-derives the folder from `downloadsRoot`, mirroring the season workspace.
 */
export function applyRowPatch(
  rows: readonly AnimeCreateRowDraft[],
  draftId: string,
  patch: AnimeCreateRowPatch,
  downloadsRoot: string,
): readonly AnimeCreateRowDraft[] {
  return rows.map((row) => {
    if (row.draftId !== draftId) {
      return row;
    }
    const next = { ...row, ...patch };
    if (patch.folder !== undefined) {
      return { ...next, folderManual: patch.folder.trim() !== '' };
    }
    if (patch.name !== undefined && !row.folderManual) {
      return { ...next, folder: deriveDownloadFolder(downloadsRoot, next.name) };
    }
    return next;
  });
}

/**
 * True when a row carries user-entered data (so removing it should be confirmed).
 * An auto-derived folder and the default type do not count as user data.
 */
export function rowHasData(row: Readonly<AnimeCreateRowDraft>): boolean {
  return (
    row.name.trim() !== '' ||
    row.page.trim() !== '' ||
    (row.folderManual && row.folder.trim() !== '') ||
    row.kind !== ANIME_CREATE_DEFAULT_KIND ||
    row.episodesWatched.trim() !== '' ||
    row.totalEpisodes.trim() !== '' ||
    row.duration.trim() !== '' ||
    row.origin.trim() !== '' ||
    row.coverPath.trim() !== '' ||
    row.genres.trim() !== '' ||
    row.studios.trim() !== ''
  );
}

/**
 * Applies a picked cover image path to one row, switching its cover source to
 * `image`. A blank/cancelled pick is a no-op.
 */
export function applyRowCover(
  rows: readonly AnimeCreateRowDraft[],
  draftId: string,
  path: string,
): readonly AnimeCreateRowDraft[] {
  if (path.trim() === '') {
    return rows;
  }
  return rows.map((row) => (row.draftId === draftId ? { ...row, coverType: 'image', coverPath: path } : row));
}

/**
 * Validates one row against its Name/Page requirement plus its partitioned
 * schedule placements, returning a user-facing message naming the row or
 * `undefined` when the row is valid.
 */
function validateAnimeCreateRow(
  row: Readonly<AnimeCreateRowDraft>,
  placements: readonly AnimeCreatePlacement[] | undefined,
): string | undefined {
  const displayName = row.name.trim() === '' ? 'A new anime row' : row.name.trim();

  if (row.name.trim() === '' || row.page.trim() === '') {
    return `${displayName} needs both a name and a page before it can be created.`;
  }

  if (!isValidDownloadPageUrl(row.page)) {
    return `${displayName} needs a valid http(s) download page URL.`;
  }

  if (placements === undefined || placements.length === 0) {
    return `${displayName} needs at least one schedule placement before it can be created.`;
  }

  return undefined;
}

/**
 * Validates every batch-create row, returning the first failing row's
 * message (or `undefined` when the whole batch is valid).
 */
export function validateAnimeCreateRows(
  rows: readonly Readonly<AnimeCreateRowDraft>[],
  creates: Readonly<Record<string, readonly AnimeCreatePlacement[]>>,
): string | undefined {
  for (const row of rows) {
    const message = validateAnimeCreateRow(row, creates[row.draftId]);
    if (message !== undefined) {
      return message;
    }
  }
  return undefined;
}

/**
 * Builds the wire-shaped batch-create command from the current rows, their
 * partitioned draft placements, and any changed-existing-neighbor entries.
 * Optional metadata (`folder`/`kind`/`premieredAt`) is included only when the
 * row actually provided it.
 */
export function buildAnimeCreateCommand(
  rows: readonly Readonly<AnimeCreateRowDraft>[],
  creates: Readonly<Record<string, readonly AnimeCreatePlacement[]>>,
  changedNeighbors: readonly ApplyAnimeScheduleDraftEntry[],
): AnimeCreateCommand {
  const items: AnimeCreateItem[] = rows.map((row) => ({
    name: row.name.trim(),
    page: row.page.trim(),
    placements: creates[row.draftId] ?? [],
    ...pruneUnprovidedFields(toOptionalCreateFields(row)),
  }));

  return { creates: items, changedNeighbors };
}

/**
 * Reads every optional wire field off a row, leaving "the row did not provide
 * this" as an empty string, an empty list or `undefined` for the prune step to
 * drop. Separating read from prune is what keeps this out of the complexity
 * gate: the previous version inlined nine conditional spreads into the mapper,
 * one branch per optional field.
 * @param row The draft row to read.
 * @returns Every optional field, provided or not.
 */
function toOptionalCreateFields(row: Readonly<AnimeCreateRowDraft>) {
  const coverPath = row.coverPath.trim();

  return {
    folder: row.folder.trim(),
    kind: row.kind === ANIME_CREATE_UNSET_FIELD ? undefined : Number(row.kind),
    episodesWatched: parseOptionalCreateInt(row.episodesWatched),
    totalEpisodes: parseOptionalCreateInt(row.totalEpisodes),
    durationMinutes: parseOptionalCreateInt(row.duration),
    origin: row.origin.trim(),
    genres: splitCreateCommaList(row.genres),
    studios: splitCreateCommaList(row.studios),
    cover: coverPath === '' ? undefined : { type: row.coverType === '' ? 'url' : row.coverType, path: coverPath },
  };
}

/**
 * Drops the fields the row left unprovided, so an optional field is omitted
 * from the payload rather than sent empty. `0` is provided: only `undefined`,
 * the empty string and the empty list count as absent.
 * @param fields The optional fields, provided or not.
 * @returns Only the fields the row actually provided.
 */
function pruneUnprovidedFields(fields: Readonly<Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)),
  );
}
