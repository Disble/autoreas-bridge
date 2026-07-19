import type { Anime, AnimeEditorRecord, AnimeEditorSaveResult, SaveAnimeEditorCommand } from '../../../../shared/contracts/anime.types';
import { isWatchingAnime, isValidAnimeEstado } from '../../../../shared/helpers/anime-estado.helpers';
import { ANIME_EDITOR_DEFAULT_DRAFT } from './anime-editor-workspace.constants';
import type { AnimeEditorChipColor, AnimeEditorDraft, AnimeEditorFilter, AnimeEditorGuardEvent, AnimeEditorGuardState, AnimeEditorListItemViewModel } from './anime-editor-workspace.types';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';

/**
 * Returns true when a scroll position is within `threshold` px of the bottom of
 * its content — the trigger to append the next batch of rows in the progressive
 * list. Guards the unmeasured case (all geometry `0`) as "at the bottom" so the
 * first real scroll still grows the window.
 */
export function isNearListBottom(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 240): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * Clamps the next progressive render limit: never below the batch already shown,
 * never above the total item count. Keeps the growing-scrollbar contract honest.
 */
export function nextAnimeEditorRenderLimit(current: number, batch: number, itemCount: number): number {
  return Math.min(itemCount, current + batch);
}

function parseNullableInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseNullableFloat(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseList(value: string) {
  return value.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
}

function nullablePatch(authority: string | number | undefined, draft: string) {
  const present = String(authority ?? '') !== draft;
  const clear = present && draft.trim().length === 0;
  return { present, clear, value: present ? draft : '' };
}

/**
 * Feature-local semantic color for an editable anime `estado`, mirroring the
 * shared estado vocabulary presentation: Viendo (in progress) is accent,
 * Finalizado (completed) is success, No me gusto (disliked) is danger, En pausa
 * (paused) is warning. Colors are presentation and stay feature-local; values
 * are bound to the shared `ANIME_ESTADO_VALID_VALUES` set so reordering the
 * canonical vocabulary would surface here instead of silently drifting.
 */
export function getAnimeEditorEstadoColor(status: number): AnimeEditorChipColor {
  const colorByStatus: Record<number, AnimeEditorChipColor> = {
    [ANIME_ESTADO_VALID_VALUES[0]]: 'accent',
    [ANIME_ESTADO_VALID_VALUES[1]]: 'success',
    [ANIME_ESTADO_VALID_VALUES[2]]: 'danger',
    [ANIME_ESTADO_VALID_VALUES[3]]: 'warning',
  };
  return colorByStatus[status] ?? 'default';
}

/** Creates a controlled draft from bridge-owned authority. */
export function createAnimeEditorDraft(record?: AnimeEditorRecord): AnimeEditorDraft {
  if (record === undefined) {
    return ANIME_EDITOR_DEFAULT_DRAFT;
  }
  return {
    name: record.frequent.name,
    status: record.frequent.status,
    progress: String(record.frequent.progress),
    totalEpisodes: String(record.frequent.totalEpisodes ?? ''),
    kind: String(record.frequent.kind ?? ''),
    page: record.frequent.page ?? '',
    folder: record.frequent.folder ?? '',
    premieredAt: String(record.details.premieredAt ?? ''),
    origin: record.details.origin ?? '',
    duration: String(record.details.duration ?? ''),
    genres: record.details.genres.join(', '),
    studios: record.details.studios.values.join(', '),
    coverType: record.details.cover?.type ?? 'url',
    coverPath: record.details.cover?.path ?? '',
  };
}

/**
 * Converts a stored `premieredAt` (Unix milliseconds as a string) into the
 * `YYYY-MM-DD` value a native date input expects. Empty or non-numeric input
 * yields an empty value so the field renders blank rather than "Invalid Date".
 */
export function premieredMsToDateInput(premieredAt: string): string {
  const trimmed = premieredAt.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const ms = Number(trimmed);
  if (!Number.isFinite(ms)) {
    return '';
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Converts a `YYYY-MM-DD` date-input value back into the Unix-millisecond string
 * the draft persists, anchored to UTC midnight. An empty value clears the field.
 */
export function premieredDateInputToMs(dateInput: string): string {
  const trimmed = dateInput.trim();
  if (trimmed.length === 0) {
    return '';
  }
  const ms = Date.parse(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(ms) ? '' : String(ms);
}

/** Compares a draft with authority so dirty state survives refreshed conflict authority. */
export function hasAnimeEditorChanges(record: AnimeEditorRecord | undefined, draft: AnimeEditorDraft) {
  return record !== undefined && JSON.stringify(createAnimeEditorDraft(record)) !== JSON.stringify(draft);
}

/** Validates user-editable values before any runtime mutation starts. */
export function validateAnimeEditorDraft(draft: AnimeEditorDraft) {
  if (draft.name.trim().length === 0) {
    return 'Name is required.';
  }
  const progress = parseNullableFloat(draft.progress);
  if (progress === undefined || progress < 0) {
    return 'Watched episodes must be a non-negative number.';
  }
  if (draft.totalEpisodes.trim().length > 0 && (parseNullableInteger(draft.totalEpisodes) === undefined || Number(draft.totalEpisodes) < 0)) {
    return 'Total episodes must be a non-negative whole number.';
  }
  if (!isValidAnimeEstado(draft.status)) {
    return 'Status is invalid.';
  }
  if (draft.kind.trim().length === 0) {
    return 'Type is required.';
  }
  return undefined;
}

/**
 * Builds the cover mutation entry, distinguishing an unchanged cover from a
 * cleared one. When nothing changed it emits an inert `present: false` entry so
 * the adapter leaves the cover untouched; otherwise it forwards the draft's type
 * and path (with `clear` set when the path was emptied). Kept as a focused pure
 * helper so `createAnimeEditorSaveCommand` stays flat and low-complexity.
 */
function createCoverPatch(record: AnimeEditorRecord, draft: AnimeEditorDraft) {
  const currentPath = record.details.cover?.path ?? '';
  const currentType = record.details.cover?.type ?? 'url';
  const changed = currentPath !== draft.coverPath || currentType !== draft.coverType;
  if (!changed) {
    return { present: false, clear: false, type: '', path: '', raw: undefined };
  }
  return {
    present: true,
    clear: draft.coverPath.trim().length === 0,
    type: draft.coverType,
    path: draft.coverPath,
    raw: record.details.cover?.raw,
  };
}

/** Builds the English changed-fields-only DTO consumed by the Wails adapter. */
export function createAnimeEditorSaveCommand(record: AnimeEditorRecord, draft: AnimeEditorDraft): SaveAnimeEditorCommand {
  const patch: Record<string, unknown> = {
    totalEpisodes: nullablePatch(record.frequent.totalEpisodes, draft.totalEpisodes),
    page: nullablePatch(record.frequent.page, draft.page),
    folder: nullablePatch(record.frequent.folder, draft.folder),
    origin: nullablePatch(record.details.origin, draft.origin),
    duration: nullablePatch(record.details.duration, draft.duration),
    kind: nullablePatch(record.frequent.kind, draft.kind),
    premieredAt: nullablePatch(record.details.premieredAt, draft.premieredAt),
    cover: createCoverPatch(record, draft),
  };
  if (record.frequent.name !== draft.name) patch['name'] = draft.name;
  if (record.frequent.status !== draft.status) patch['status'] = draft.status;
  const progress = parseNullableFloat(draft.progress);
  if (progress !== undefined && progress !== record.frequent.progress) patch['progress'] = progress;
  const genres = parseList(draft.genres);
  if (JSON.stringify(genres) !== JSON.stringify(record.details.genres)) patch['genres'] = genres;
  const studios = parseList(draft.studios);
  if (JSON.stringify(studios) !== JSON.stringify(record.details.studios.values)) patch['studios'] = studios;
  return { animeId: record.animeId, baseModifiedAt: record.modifiedAt, patch: patch as unknown as SaveAnimeEditorCommand['patch'] };
}

/** Filters and sorts the editor rail with currently watching anime first. */
export function createAnimeEditorListItems(animes: readonly Anime[], filter: AnimeEditorFilter, query: string, selectedAnimeId?: string): readonly AnimeEditorListItemViewModel[] {
  const normalizedQuery = query.trim().toLowerCase();
  return animes
    .filter((anime) => (filter === 'all' || isWatchingAnime(anime)) && (normalizedQuery.length === 0 || anime.nombre.toLowerCase().includes(normalizedQuery)))
    .toSorted((left, right) => {
      const watchingDifference = Number(!isWatchingAnime(left)) - Number(!isWatchingAnime(right));
      return watchingDifference === 0 ? left.nombre.localeCompare(right.nombre) : watchingDifference;
    })
    .map((anime) => ({ id: anime.id, animeId: anime.id, nombre: anime.nombre, subtitle: `${anime.nrocapvisto} watched`, selected: anime.id === selectedAnimeId }));
}

/** Keeps transport feedback string-safe while preserving backend messages verbatim. */
export function resolveAnimeEditorFeedbackMessage(result: { readonly message?: unknown }, fallback: string) {
  return typeof result.message === 'string' && result.message.length > 0 ? result.message : fallback;
}

/** Identifies outcomes that intentionally synchronize the draft with returned authority. */
export function isIntentionalEditorOutcome(result: AnimeEditorSaveResult) {
  return result.outcome === 'applied' || result.outcome === 'no_op';
}

/** Converts thrown runtime values into stable user feedback. */
export function toEditorErrorMessage(error: unknown) {
  return error instanceof Error && error.message.length > 0 ? error.message : 'The editor operation failed.';
}

/** Reduces all guarded transitions through one explicit pending-action state machine. */
export function reduceAnimeEditorGuard(state: AnimeEditorGuardState, event: AnimeEditorGuardEvent): AnimeEditorGuardState {
  if (event.type === 'request') {
    return { pendingAction: event.action };
  }
  return { pendingAction: undefined };
}
