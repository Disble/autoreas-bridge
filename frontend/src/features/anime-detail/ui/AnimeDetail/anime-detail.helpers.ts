import type { contracts } from '../../../../../wailsjs/go/models';
import { normalizeStoredCoverPath } from '../../../../shared/anime-cover/anime-cover.helpers';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import type { AnimeDetail } from '../../../../shared/contracts/anime.types';
import {
  ANIME_DETAIL_LONG_DATE_FORMATTER,
  ANIME_DETAIL_NO_DURATION_MESSAGE,
  ANIME_DETAIL_NO_TOTAL_EPISODES_MESSAGE,
  ANIME_DETAIL_STATUS_ACTIVE_LABEL,
  ANIME_DETAIL_STATUS_INACTIVE_LABEL,
  ANIME_DETAIL_UNKNOWN_LABEL,
} from './anime-detail.constants';
import type {
  AnimeDetailAction,
  AnimeDetailConfirmationViewModel,
  AnimeDetailDesktopAction,
  AnimeDetailDesktopActionFeedback,
  AnimeDetailLoadState,
  AnimeDetailMutationResolution,
  AnimeDetailToast,
  AnimeDetailViewModel,
  HeroChipColor,
} from './anime-detail.types';

/**
 * Confirms that an async mutation still belongs to the currently rendered
 * anime route visit, preventing an older visit to the same id from reviving.
 */
export function isAnimeDetailMutationRouteActive(
  activeAnimeId: string,
  activeRouteGeneration: number,
  actionAnimeId: string,
  actionRouteGeneration: number,
): boolean {
  return activeAnimeId === actionAnimeId && activeRouteGeneration === actionRouteGeneration;
}

/**
 * Confirms that an async mutation still belongs to a mounted instance of the
 * exact anime route visit that started it.
 */
export function isAnimeDetailMutationVisitActive(
  isMounted: boolean,
  activeAnimeId: string,
  activeRouteGeneration: number,
  actionAnimeId: string,
  actionRouteGeneration: number,
): boolean {
  return isMounted && isAnimeDetailMutationRouteActive(
    activeAnimeId,
    activeRouteGeneration,
    actionAnimeId,
    actionRouteGeneration,
  );
}

/** Advances the route-visit generation only when AnimeDetail changes ids. */
export function nextAnimeDetailMutationRouteGeneration(
  activeAnimeId: string,
  activeRouteGeneration: number,
  nextAnimeId: string,
): number {
  return activeAnimeId === nextAnimeId ? activeRouteGeneration : activeRouteGeneration + 1;
}

/**
 * Builds the explicit English confirmation copy for Repeat or Restore so the
 * dumb component never derives business action text inline.
 */
export function toAnimeDetailConfirmation(
  action: AnimeDetailAction,
  animeName: string,
): AnimeDetailConfirmationViewModel {
  if (action === 'repeat') {
    return {
      action,
      heading: `Repeat ${animeName}?`,
      description: 'This starts a new watch cycle.',
      confirmLabel: 'Confirm Repeat',
    };
  }

  return {
    action,
    heading: `Restore ${animeName}?`,
    description: 'This makes the anime active again.',
    confirmLabel: 'Confirm Restore',
  };
}

/**
 * Interprets the authoritative Wails result into honest UI feedback and a
 * narrowly scoped Detail-refresh decision. Unknown or malformed results fail
 * closed rather than being presented as successful mutations.
 */
export function resolveAnimeDetailMutation(
  action: AnimeDetailAction,
  result: contracts.EpisodeCommandResult,
): AnimeDetailMutationResolution {
  const actionLabel = action === 'repeat' ? 'Repeat' : 'Restore';
  const failure = (description: string): AnimeDetailMutationResolution => ({
    feedback: {
      status: 'danger',
      title: `${actionLabel} failed`,
      description,
    },
    shouldRefetch: false,
  });

  if (result.status !== 'ok') {
    return failure(result.message ?? `${actionLabel} is unavailable.`);
  }

  if (!Number.isFinite(result.modifiedAt)) {
    return failure(`${actionLabel} returned an unexpected result without a current version.`);
  }

  if (result.outcome === 'applied') {
    return {
      feedback: {
        status: 'success',
        title: `${actionLabel} applied`,
        description: `${actionLabel} was applied. Current version: ${result.modifiedAt}.`,
      },
      shouldRefetch: true,
    };
  }

  if (result.outcome === 'no_op') {
    return {
      feedback: {
        status: 'accent',
        title: `${actionLabel} not needed`,
        description: `No changes were needed. Current version: ${result.modifiedAt}.`,
      },
      shouldRefetch: true,
    };
  }

  if (result.outcome === 'conflict' && result.conflictId !== undefined && result.conflictId !== '') {
    return {
      feedback: {
        status: 'warning',
        title: `${actionLabel} not applied`,
        description: `The anime changed before ${actionLabel} could be applied. Current version: ${result.modifiedAt}. Conflict: ${result.conflictId}.`,
      },
      shouldRefetch: true,
    };
  }

  return failure(`${actionLabel} returned an unexpected result and was not applied.`);
}

/**
 * Preserves an already-authoritative mutation outcome while making a failed
 * follow-up Detail refresh explicit, so the UI never rewrites applied as failed.
 */
export function withAnimeDetailRefreshFailure(
  resolution: AnimeDetailMutationResolution,
): AnimeDetailMutationResolution {
  return {
    feedback: {
      ...resolution.feedback,
      status: 'warning',
      description: `${resolution.feedback.description} Anime Detail could not be refreshed.`,
    },
    shouldRefetch: false,
  };
}

/**
 * Formats epoch millis as a long-form local date (e.g. "June 30, 2026") for
 * the general-data section's estreno/creación/últ. cap visto fields,
 * mirroring `history-table.helpers.ts`'s `formatHistoryLongDate`. Returns
 * `undefined` when the millis are missing, so callers can render a fallback.
 */
export function formatAnimeDetailLongDate(millis?: number): string | undefined {
  if (millis === undefined) {
    return undefined;
  }

  return ANIME_DETAIL_LONG_DATE_FORMATTER.format(new Date(millis));
}

/**
 * Estado label from the canonical shared vocabulary
 * (`shared/helpers/anime-estado.helpers.ts`): 0=Viendo, 1=Finalizado, 2=No me gusto,
 * 3=En pausa. Falls back to the raw estado for any unrecognized value.
 */
export function getAnimeDetailEstadoLabel(estado: number): string {
  return getAnimeEstadoLabel(estado);
}

/**
 * Semantic HeroUI chip color per estado, mirroring
 * `history-table.helpers.ts`'s `getHistoryEstadoColor`: Viendo (in progress)
 * is the accent/ongoing color, Finalizado (completed) is success, No me gusto
 * (disliked) is danger, En pausa (paused) is warning. Unknown estados fall
 * back to the neutral default color.
 */
export function getAnimeDetailEstadoColor(estado: number): HeroChipColor {
  switch (estado) {
    case 0:
      return 'accent';
    case 1:
      return 'success';
    case 2:
      return 'danger';
    case 3:
      return 'warning';
    default:
      return 'default';
  }
}

/**
 * Tipo label domain verified against the REAL fixture (2026-07-04 scan of
 * `animes.dat`: distinct tipo = 0/1/2/3 + null) and Legacy's dropdown order:
 * 0=Anime (TV), 1=Película, 2=Especial, 3=OVA. These are Legacy data
 * literals, kept verbatim. (The earlier Serie/Película/OVA mapping was wrong:
 * it mislabeled tipo 2 — Especial — as OVA.) An absent `tipo` degrades to
 * the "Unknown" label; an unrecognized numeric value falls back to its raw
 * string rather than inventing a label.
 */
export function getAnimeDetailTipoLabel(tipo?: number): string {
  if (tipo === undefined) {
    return ANIME_DETAIL_UNKNOWN_LABEL;
  }

  switch (tipo) {
    case 0:
      return 'Anime (TV)';
    case 1:
      return 'Película';
    case 2:
      return 'Especial';
    case 3:
      return 'OVA';
    default:
      return String(tipo);
  }
}

/**
 * Maps the backend `activo` flag to the status chip's label. Detail uses a
 * danger-colored chip for the inactive/soft-deleted ("eliminado") case per
 * design Decision 5, since this is the surface where that state matters most.
 */
export function getAnimeDetailStatusLabel(activo: number): string {
  return activo === 1 ? ANIME_DETAIL_STATUS_ACTIVE_LABEL : ANIME_DETAIL_STATUS_INACTIVE_LABEL;
}

/** Semantic chip color paired with {@link getAnimeDetailStatusLabel}: success when active, danger when inactive/eliminado. */
export function getAnimeDetailStatusColor(activo: number): HeroChipColor {
  return activo === 1 ? 'success' : 'danger';
}

/**
 * Renders the progress line's episode count: `12 of 28 episodes`, or the
 * watched count with an explicit fallback when `totalcap` is absent.
 */
export function formatAnimeDetailProgressCount(watched: number, total?: number): string {
  if (total !== undefined) {
    return `${watched} of ${total} episodes`;
  }

  const watchedLabel = watched === 1 ? '1 episode' : `${watched} episodes`;
  return `${watchedLabel} · ${ANIME_DETAIL_NO_TOTAL_EPISODES_MESSAGE}`;
}

/** Renders the per-episode duration in minutes, or an explicit fallback when `duracion` is absent. */
export function formatAnimeDetailDurationLabel(duracion?: number): string {
  return duracion === undefined ? ANIME_DETAIL_NO_DURATION_MESSAGE : `Duration · ${duracion} min`;
}

/**
 * Computes the watched/total progress ratio as a 0-100 integer, clamped at
 * 100 when watched exceeds total. Returns `undefined` when the total is
 * missing or non-positive, so callers know to skip the progress bar
 * entirely rather than rendering a meaningless one.
 */
export function formatAnimeDetailProgressRatio(current: number, total?: number): number | undefined {
  if (total === undefined || total <= 0) {
    return undefined;
  }

  return Math.min(100, Math.round((current / total) * 100));
}

/**
 * Returns `true` when `historyState` (the raw `window.history.state` value)
 * carries a react-router v7 `idx` greater than 0, meaning the current
 * location was reached by pushing at least one prior entry onto this
 * session's history stack. Encapsulated so the router-back-vs-`/history`-
 * fallback decision is testable without touching the real `window.history`.
 */
export function hasPreviousHistoryEntry(historyState: unknown): boolean {
  if (typeof historyState !== 'object' || historyState === null) {
    return false;
  }

  const idx = (historyState as { idx?: unknown }).idx;
  return typeof idx === 'number' && idx > 0;
}

/**
 * Derives which of the three states Detail renders from the loaded snapshot:
 * `undefined` is still loading, `null` is not found, a record is loaded.
 */
export function getAnimeDetailLoadState(detail: AnimeDetail | null | undefined): AnimeDetailLoadState {
  if (detail === undefined) {
    return 'loading';
  }

  return detail === null ? 'not-found' : 'loaded';
}

/**
 * Runs one desktop action (copy the folder path, open the page in the default
 * browser) through its bridge binding and returns the toast that reports it,
 * or `undefined` when a success needs none. A missing binding, a non-ok result
 * and a rejected request all fail closed with the action's failure toast.
 */
export async function runAnimeDetailDesktopAction(
  action: AnimeDetailDesktopAction | undefined,
  animeId: string,
  feedback: AnimeDetailDesktopActionFeedback,
): Promise<AnimeDetailToast | undefined> {
  const failure: AnimeDetailToast = { status: 'danger', message: feedback.failure };
  if (action === undefined) {
    return failure;
  }

  try {
    const result = await action(animeId);
    if (result.status !== 'ok') {
      return failure;
    }
    return feedback.success === undefined ? undefined : { status: 'success', message: feedback.success };
  } catch {
    return failure;
  }
}

/**
 * Converts the `AnimeDetail` DTO into the view model rendered by the shared
 * detail component. Every field gets an explicit fallback rather than a
 * silent blank, and every per-anime label (cover alt, action names) is built
 * here so the dumb UI never formats copy inline. Per-watch history derives
 * from the raw DTO in `AnimeWatchHistory`, not from this view model.
 */
export function toAnimeDetailViewModel(detail: AnimeDetail): AnimeDetailViewModel {
  const folder = detail.folder ?? '';
  const hasFolder = folder !== '';

  return {
    id: detail.id,
    nombre: detail.name,
    modifiedAt: detail.modified_at,
    canRepeat: detail.status > 0,
    canRestore: detail.active === 0,
    hasStoredCover: normalizeStoredCoverPath(detail.cover) !== undefined,
    coverAlt: `Cover of ${detail.name}`,
    repeatLabel: `Repeat ${detail.name}`,
    restoreLabel: `Restore ${detail.name}`,
    editLabel: `Edit ${detail.name}`,
    estadoLabel: getAnimeDetailEstadoLabel(detail.status),
    estadoColor: getAnimeDetailEstadoColor(detail.status),
    tipoLabel: getAnimeDetailTipoLabel(detail.kind),
    statusLabel: getAnimeDetailStatusLabel(detail.active),
    statusColor: getAnimeDetailStatusColor(detail.active),
    progressCountLabel: formatAnimeDetailProgressCount(detail.episodesWatched, detail.totalEpisodes),
    durationLabel: formatAnimeDetailDurationLabel(detail.durationMinutes),
    progressRatio: formatAnimeDetailProgressRatio(detail.episodesWatched, detail.totalEpisodes),
    paginaUrl: detail.sourceUrl,
    hasFolder,
    carpetaLabel: hasFolder ? folder : ANIME_DETAIL_UNKNOWN_LABEL,
    estrenoLabel: formatAnimeDetailLongDate(detail.premieredAt) ?? ANIME_DETAIL_UNKNOWN_LABEL,
    creacionLabel: formatAnimeDetailLongDate(detail.createdAt) ?? ANIME_DETAIL_UNKNOWN_LABEL,
    ultCapVistoLabel: formatAnimeDetailLongDate(detail.lastWatchedAt) ?? ANIME_DETAIL_UNKNOWN_LABEL,
    genres: detail.genres,
    hasGenres: detail.genres.length > 0,
    studios: detail.studios ?? ANIME_DETAIL_UNKNOWN_LABEL,
    origin: detail.origin ?? ANIME_DETAIL_UNKNOWN_LABEL,
    isFirstWatch: detail.firstCycle === 1,
  };
}
