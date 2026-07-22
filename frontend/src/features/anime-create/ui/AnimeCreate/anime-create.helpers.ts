import { ANIME_SCHEDULE_DRAFT_ID_PREFIX } from '../../../anime-schedule-ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';
import type { AnimeCreateCommand, AnimeCreateItem, AnimeCreatePlacement, ApplyAnimeScheduleDraftEntry } from '../../../../shared/contracts/anime.types';
import { ANIME_CREATE_UNSET_FIELD } from './anime-create.constants';
import type { AnimeCreateRowDraft } from './anime-create.types';

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
    kind: ANIME_CREATE_UNSET_FIELD,
    premieredAt: ANIME_CREATE_UNSET_FIELD,
  };
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
  return rows.map((row) => (row.draftId === draftId ? { ...row, folder } : row));
}

/**
 * Validates one row against its Name/Page requirement plus its partitioned
 * schedule placements, returning a user-facing message naming the row or
 * `undefined` when the row is valid.
 */
export function validateAnimeCreateRow(
  row: Readonly<AnimeCreateRowDraft>,
  placements: readonly AnimeCreatePlacement[] | undefined,
): string | undefined {
  const displayName = row.name.trim() === '' ? 'A new anime row' : row.name.trim();

  if (row.name.trim() === '' || row.page.trim() === '') {
    return `${displayName} needs both a name and a page before it can be created.`;
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
  const items: AnimeCreateItem[] = rows.map((row) => {
    const item: AnimeCreateItem = {
      name: row.name.trim(),
      page: row.page.trim(),
      placements: creates[row.draftId] ?? [],
    };
    return {
      ...item,
      ...(row.folder.trim() === '' ? {} : { folder: row.folder.trim() }),
      ...(row.kind === ANIME_CREATE_UNSET_FIELD ? {} : { kind: Number(row.kind) }),
      ...(row.premieredAt === ANIME_CREATE_UNSET_FIELD ? {} : { premieredAt: Number(row.premieredAt) }),
    };
  });

  return { creates: items, changedNeighbors };
}
