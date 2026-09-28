import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import { normalizeStoredCoverPath } from '../../../../shared/anime-cover/anime-cover.helpers';
import type { Anime, AnimeEditorRecord, AnimeEditorSaveResult, SaveAnimeEditorCommand } from '../../../../shared/contracts/anime.types';
import { isScheduledAnime, isValidAnimeEstado } from '../../../../shared/helpers/anime-estado.helpers';
import { isValidDownloadPageUrl } from '../../../../shared/helpers/url.helpers';
import { ANIME_EDITOR_COVER_PLACEHOLDER, ANIME_EDITOR_DEFAULT_DRAFT } from './anime-editor-workspace.constants';
import type { AnimeEditorChipColor, AnimeEditorCoverRequestPlan, AnimeEditorCoverResult, AnimeEditorCoverTarget, AnimeEditorDraft, AnimeEditorEmptyState, AnimeEditorEmptyStateInput, AnimeEditorFilter, AnimeEditorGuardEvent, AnimeEditorGuardState, AnimeEditorLifecycleAction, AnimeEditorLifecycleConfirmation, AnimeEditorListItemViewModel, AnimeEditorListRowViewModel } from './anime-editor-workspace.types';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';

/**
 * Progressive-rail geometry now lives in `shared/helpers/progressive-list.helpers`
 * so the Downloads rail can reuse it without importing across feature boundaries.
 * Re-exported under the original names because this rail is not the only caller
 * anymore, but its behaviour is unchanged.
 */
export { isNearListBottom, nextRenderLimit as nextAnimeEditorRenderLimit } from '../../../../shared/helpers/progressive-list.helpers';

/** Parses a whole-number form field, treating blank and non-integer input as absent. */
function parseNullableInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Parses a decimal form field, treating blank and non-finite input as absent. */
function parseNullableFloat(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Splits a comma-separated form field into trimmed, non-empty entries. */
function parseList(value: string) {
  return value.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Builds a nullable scalar patch entry, marking it cleared when the draft is blank. */
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
    origin: record.details.origin ?? '',
    duration: String(record.details.duration ?? ''),
    genres: record.details.genres.join(', '),
    studios: record.details.studios.values.join(', '),
    coverType: record.details.cover?.type ?? 'url',
    coverPath: record.details.cover?.path ?? '',
  };
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
  if (draft.duration.trim().length > 0 && (parseNullableInteger(draft.duration) === undefined || Number(draft.duration) < 1)) {
    return 'Duration must be a positive whole number of minutes.';
  }
  if (draft.kind.trim().length === 0) {
    return 'Type is required.';
  }
  if (draft.page.trim().length > 0 && !isValidDownloadPageUrl(draft.page)) {
    return 'Download page must be a valid http(s) URL.';
  }
  return undefined;
}

/**
 * Builds the cover mutation entry, distinguishing an unchanged cover from a
 * cleared one. When nothing changed it emits an inert `present: false` entry so
 * the adapter leaves the cover untouched.
 *
 * Emptying the path is a removal, and the backend's `validateCoverPatch` only
 * accepts a removal whose type, path, and raw fields are all empty -- anything
 * else is rejected as a "malformed cleared cover patch". Forwarding the draft's
 * type alongside `clear` is what made a cover impossible to remove once set, so
 * the clear branch returns the canonical empty shape instead of the draft's.
 *
 * Kept as a focused pure helper so `createAnimeEditorSaveCommand` stays flat and
 * low-complexity.
 */
function createCoverPatch(record: AnimeEditorRecord, draft: AnimeEditorDraft) {
  const currentPath = record.details.cover?.path ?? '';
  const currentType = record.details.cover?.type ?? 'url';
  const changed = currentPath !== draft.coverPath || currentType !== draft.coverType;
  if (!changed) {
    return { present: false, clear: false, type: '', path: '', raw: undefined };
  }
  if (draft.coverPath.trim().length === 0) {
    return { present: true, clear: true, type: '', path: '', raw: undefined };
  }
  return {
    present: true,
    clear: false,
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

/**
 * Filters and sorts the editor rail with the "Watching now" (active for
 * consumption) animes first. Membership matches the Daily schedule board via
 * `isScheduledAnime` (active + at least one scheduled day) so a paused anime the
 * user still sees in Daily is included, not just Viendo. The "Watching now"
 * filter restricts to that set; "All anime" keeps everything but still bubbles
 * the scheduled ones to the top.
 */
export function createAnimeEditorListItems(animes: readonly Anime[], filter: AnimeEditorFilter, query: string, selectedAnimeId?: string): readonly AnimeEditorListItemViewModel[] {
  const normalizedQuery = query.trim().toLowerCase();
  return animes
    .filter((anime) => (filter === 'all' || isScheduledAnime(anime)) && (normalizedQuery.length === 0 || anime.name.toLowerCase().includes(normalizedQuery)))
    .toSorted((left, right) => {
      const scheduledDifference = Number(!isScheduledAnime(left)) - Number(!isScheduledAnime(right));
      return scheduledDifference === 0 ? left.name.localeCompare(right.name) : scheduledDifference;
    })
    .map((anime) => ({ id: anime.id, animeId: anime.id, nombre: anime.name, subtitle: `${anime.episodesWatched} watched`, selected: anime.id === selectedAnimeId, hasCover: anime.hasCover }));
}

/**
 * Reports whether the loaded record carries a renderable saved cover. The gate
 * reads the SAVED record's own cover source through the shared
 * `normalizeStoredCoverPath` rule (blank, whitespace-only, and the literal
 * `"null"` sentinel are all "no cover"), so the header thumbnail can never be
 * driven by an unsaved draft edit and a raw stored path never becomes an image
 * source by itself. A local Windows path counts as a cover here exactly like a
 * URL: the binding, not the path, produces the bytes.
 */
export function hasSavedAnimeCover(record?: AnimeEditorRecord): boolean {
  return normalizeStoredCoverPath(record?.details.cover?.path) !== undefined;
}

/**
 * Builds the cover targets the rail resolves: every row inside the progressive
 * visible window, plus the selected saved record. The window is the gate that
 * keeps an 800-anime library from costing 800 lookups, and the selected record
 * is added separately because a deep link can select an anime the window has
 * not grown to yet.
 *
 * The record is authoritative for its own anime, which is what makes a saved
 * cover change visible: its `details.cover.path` is the only place the rail can
 * learn WHICH source an anime's cover is, so that id carries the saved source
 * as its version (and reports no cover at all once that source is cleared).
 * Every other row reports presence only, because the slim list DTO deliberately
 * never exposes a cover path.
 */
export function toAnimeEditorCoverTargets(
  items: readonly AnimeEditorListItemViewModel[],
  visibleCount: number,
  record?: AnimeEditorRecord,
): readonly AnimeEditorCoverTarget[] {
  const targetsById = new Map<string, AnimeEditorCoverTarget>();
  for (const item of items.slice(0, visibleCount)) {
    targetsById.set(item.animeId, { animeId: item.animeId, hasCover: item.hasCover });
  }
  if (record !== undefined) {
    const savedCover = normalizeStoredCoverPath(record.details.cover?.path);
    targetsById.set(
      record.animeId,
      savedCover === undefined
        ? { animeId: record.animeId, hasCover: false }
        : { animeId: record.animeId, coverVersion: savedCover, hasCover: true },
    );
  }
  return [...targetsById.values()];
}

/**
 * Plans one render of the rail's cover work: which animes it must look up, which
 * must fall back to the placeholder, and the source identity it remembers once
 * the plan is adopted.
 *
 * The remembered identity is what keeps the lookup cache honest across the two
 * flows that can change a cover. A target whose saved source differs from the
 * one already resolved is a DIFFERENT cover, so it is looked up again -- a saved
 * A->B on the same anime must not keep showing A. A target whose source merely
 * becomes known (the record loaded and named the source behind a row that was
 * already resolved), or unknown again (the record is gone because the user
 * selected something else), is not: the art already on screen is still the art
 * of that source, and re-resolving on every click would double the traffic.
 *
 * A target without a cover invalidates instead: the entry goes back to the
 * placeholder and the remembered source is forgotten, so the removed cover's
 * art cannot linger in a row the list just reloaded as coverless, and a cover
 * added later is resolved fresh rather than reusing what was there before.
 */
export function planAnimeEditorCoverRequests(
  targets: readonly AnimeEditorCoverTarget[],
  requestedVersions: ReadonlyMap<string, string | undefined>,
): AnimeEditorCoverRequestPlan {
  const nextVersions = new Map(requestedVersions);
  const requests: string[] = [];
  const invalidatedIds: string[] = [];

  for (const target of targets) {
    const { animeId, coverVersion } = target;

    if (!target.hasCover) {
      nextVersions.delete(animeId);
      invalidatedIds.push(animeId);
      continue;
    }

    if (!nextVersions.has(animeId)) {
      nextVersions.set(animeId, coverVersion);
      requests.push(animeId);
      continue;
    }

    const requestedVersion = nextVersions.get(animeId);

    if (requestedVersion === coverVersion || coverVersion === undefined) {
      continue;
    }

    nextVersions.set(animeId, coverVersion);

    if (requestedVersion !== undefined) {
      requests.push(animeId);
    }
  }

  return { invalidatedIds, requests, requestedVersions: nextVersions };
}

/**
 * Maps one cover-binding result onto the cache entry the rail renders. Kept
 * pure and exported so the "placeholder unless there are real bytes" rule has a
 * single owner: the binding already degrades its own failures, so a result that
 * claims a cover but carries no bytes is not trusted.
 */
export function toAnimeEditorCoverEntry(result: AnimeEditorCoverResult): AnimeCoverEntry {
  return result.source === 'cover' && result.dataUrl !== undefined ? { dataUrl: result.dataUrl, status: 'cover' } : ANIME_EDITOR_COVER_PLACEHOLDER;
}

/**
 * Joins the rail's cover cache onto each projected list row. A coverless row
 * renders the shared placeholder even when the cache still holds art for that
 * id -- a cleared cover leaves the old thumbnail in memory until its entry is
 * invalidated, and a row the backend reports as coverless must never show it.
 * An unresolved row falls back to the same placeholder, so the row's geometry
 * is identical whether the cover is missing, pending, or failed.
 */
export function toAnimeEditorListRowViewModels(
  items: readonly AnimeEditorListItemViewModel[],
  covers: ReadonlyMap<string, AnimeCoverEntry>,
): readonly AnimeEditorListRowViewModel[] {
  return items.map((item) => ({
    ...item,
    cover: item.hasCover ? (covers.get(item.animeId) ?? ANIME_EDITOR_COVER_PLACEHOLDER) : ANIME_EDITOR_COVER_PLACEHOLDER,
  }));
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

/**
 * Builds the confirmation copy for a lifecycle action (Deactivate, Restore,
 * or Repeat), generalizing the one confirm modal the form drives before any
 * lifecycle write. Mirrors `toAnimeDetailConfirmation`'s shape
 * (`anime-detail.helpers.ts`), but copy is duplicated rather than imported
 * across the feature boundary: two features with different wording is not a
 * shared widget. Deactivate's copy is preserved byte-identical to the
 * previous hardcoded modal.
 */
export function toAnimeEditorLifecycleConfirmation(action: AnimeEditorLifecycleAction): AnimeEditorLifecycleConfirmation {
  if (action === 'deactivate') {
    return {
      action,
      heading: 'Deactivate anime',
      description: 'This hides the anime from your active library. You can restore it later from History.',
      confirmLabel: 'Deactivate',
      isDestructive: true,
    };
  }
  if (action === 'restore') {
    return {
      action,
      heading: 'Restore anime',
      description: 'This makes the anime active again in your library.',
      confirmLabel: 'Restore',
      isDestructive: false,
    };
  }
  return {
    action,
    heading: 'Repeat anime',
    description: 'This resets watched episodes to zero and starts a new watch cycle.',
    confirmLabel: 'Repeat',
    isDestructive: false,
  };
}

/** Reduces all guarded transitions through one explicit pending-action state machine. */
export function reduceAnimeEditorGuard(state: AnimeEditorGuardState, event: AnimeEditorGuardEvent): AnimeEditorGuardState {
  if (event.type === 'request') {
    return { pendingAction: event.action };
  }
  return { pendingAction: undefined };
}

/**
 * Tells an empty Library apart from a Library the user has filtered down to
 * nothing. The two need opposite recovery actions, and offering the wrong one
 * either hides the only route out of an empty library or invites the user to
 * create a duplicate of an anime the search is hiding.
 *
 * Zero visible rows with no active criteria is deliberately not criteria-empty:
 * nothing the user could clear would bring a row back, so claiming otherwise
 * would be a dead end.
 */
export function classifyAnimeEditorEmptyState(input: AnimeEditorEmptyStateInput): AnimeEditorEmptyState {
  if (input.isLoadingList) {
    return 'none';
  }
  if (input.sourceCount === 0) {
    return 'actual';
  }
  if (input.visibleCount > 0) {
    return 'none';
  }
  const hasActiveCriteria = input.query.trim().length > 0 || input.filter !== 'all';
  return hasActiveCriteria ? 'criteria' : 'none';
}
