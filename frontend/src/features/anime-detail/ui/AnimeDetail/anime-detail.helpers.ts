import type { AnimeDetail, AnimeRepeticion } from '../../../../shared/contracts/anime.types';
import {
  ANIME_DETAIL_DURATION_TILE_LABEL,
  ANIME_DETAIL_NO_DURATION_MESSAGE,
  ANIME_DETAIL_NO_TOTAL_EPISODES_MESSAGE,
  ANIME_DETAIL_STATUS_ACTIVE_LABEL,
  ANIME_DETAIL_STATUS_INACTIVE_LABEL,
  ANIME_DETAIL_TOTAL_TILE_LABEL,
  ANIME_DETAIL_UNKNOWN_LABEL,
  ANIME_DETAIL_WATCHED_TILE_LABEL,
} from './anime-detail.constants';
import type {
  AnimeDetailStatTile,
  AnimeDetailViewModel,
  AnimeRepeticionViewModel,
  HeroChipColor,
} from './anime-detail.types';

// Hoisted per react-doctor/js-hoist-intl: constructing an Intl.DateTimeFormat
// is expensive, so it must not happen on every format call. Mirrors
// `history-table.helpers.ts`'s LONG_DATE_FORMATTER, duplicated feature-locally.
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Builds a human-readable progress label from the current and total episode
 * counters. Falls back to "?" when the total is missing, mirroring the
 * Catalog panel's progress formatting.
 */
export function formatAnimeDetailProgress(current: number, total?: number): string {
  return total === undefined ? `${current} / ?` : `${current} / ${total}`;
}

/**
 * Formats an epoch-millis date into a stable `YYYY-MM-DD` label. Returns
 * `undefined` when the millis are missing, so callers can render a fallback.
 * Used for the repetir timeline entries only; the general-data fechas use
 * `formatAnimeDetailLongDate` instead (Anime Detail delta spec).
 */
export function formatAnimeDetailDate(millis?: number): string | undefined {
  if (millis === undefined) {
    return undefined;
  }

  return new Date(millis).toISOString().slice(0, 10);
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

  return LONG_DATE_FORMATTER.format(new Date(millis));
}

/**
 * Estado label domain verified against `ANIME_ESTADO_OPTIONS`
 * (`catalog-panel.constants.ts`), same domain used by
 * `history-table.helpers.ts`'s `getHistoryEstadoLabel`: 0=Viendo,
 * 1=Finalizado, 2=Abandonado, 3=Pendiente. Falls back to the raw estado for
 * any unrecognized value rather than inventing a label.
 */
export function getAnimeDetailEstadoLabel(estado: number): string {
  switch (estado) {
    case 0:
      return 'Viendo';
    case 1:
      return 'Finalizado';
    case 2:
      return 'Abandonado';
    case 3:
      return 'Pendiente';
    default:
      return String(estado);
  }
}

/**
 * Tipo label domain verified against `ANIME_TIPO_OPTIONS`
 * (`catalog-panel.constants.ts`): 0=Serie, 1=Película, 2=OVA. An absent
 * `tipo` (legacy record never set it) degrades to the "Unknown" label; an
 * unrecognized numeric value falls back to its raw string rather than
 * inventing a label.
 */
export function getAnimeDetailTipoLabel(tipo?: number): string {
  if (tipo === undefined) {
    return ANIME_DETAIL_UNKNOWN_LABEL;
  }

  switch (tipo) {
    case 0:
      return 'Serie';
    case 1:
      return 'Película';
    case 2:
      return 'OVA';
    default:
      return String(tipo);
  }
}

/** Joins the estado and tipo labels into the hero's "estado • tipo" subtitle line. */
export function formatAnimeDetailSubtitle(estadoLabel: string, tipoLabel: string): string {
  return `${estadoLabel} • ${tipoLabel}`;
}

/**
 * Maps the backend `activo` flag to the hero status chip's label. Unlike
 * `catalog-panel.helpers.ts`'s `toAnimeStatus` (Active/Inactive with a
 * neutral color), the Detail hero uses a danger-colored chip for the
 * inactive/soft-deleted ("eliminado") case per design Decision 5, since this
 * is the surface where that state matters most.
 */
export function getAnimeDetailStatusLabel(activo: number): string {
  return activo === 1 ? ANIME_DETAIL_STATUS_ACTIVE_LABEL : ANIME_DETAIL_STATUS_INACTIVE_LABEL;
}

/** Semantic chip color paired with {@link getAnimeDetailStatusLabel}: success when active, danger when inactive/eliminado. */
export function getAnimeDetailStatusColor(activo: number): HeroChipColor {
  return activo === 1 ? 'success' : 'danger';
}

/** Renders the total-episodes stat value, or an explicit fallback when `totalcap` is absent. */
export function formatAnimeDetailTotalLabel(total?: number): string {
  return total === undefined ? ANIME_DETAIL_NO_TOTAL_EPISODES_MESSAGE : String(total);
}

/** Renders the per-episode duration in minutes, or an explicit fallback when `duracion` is absent. */
export function formatAnimeDetailDurationLabel(duracion?: number): string {
  return duracion === undefined ? ANIME_DETAIL_NO_DURATION_MESSAGE : `${duracion} min`;
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
 * Builds the per-chapter section's three stat tiles (watched, total
 * episodes, duration), each with an explicit fallback baked in via
 * {@link formatAnimeDetailTotalLabel} / {@link formatAnimeDetailDurationLabel}.
 */
function buildAnimeDetailStatTiles(
  watched: number,
  totalLabel: string,
  durationLabel: string,
): readonly AnimeDetailStatTile[] {
  return [
    { label: ANIME_DETAIL_WATCHED_TILE_LABEL, value: String(watched) },
    { label: ANIME_DETAIL_TOTAL_TILE_LABEL, value: totalLabel },
    { label: ANIME_DETAIL_DURATION_TILE_LABEL, value: durationLabel },
  ];
}

/**
 * Maps a single legacy repetition entry into its display view model. Missing
 * `fechaRepeticion` (legacy null date) degrades to the "Unknown" label rather
 * than omitting the entry.
 */
export function toAnimeRepeticionViewModel(
  entry: AnimeRepeticion,
  index: number,
): AnimeRepeticionViewModel {
  return {
    key: `${entry.numrepeticion}-${index}`,
    numRepeticion: entry.numrepeticion,
    progressLabel: formatAnimeDetailProgress(entry.nrocapvisto),
    repeatedOnLabel: formatAnimeDetailDate(entry.fechaRepeticion) ?? ANIME_DETAIL_UNKNOWN_LABEL,
  };
}

/**
 * Converts the `AnimeDetail` DTO into the view model rendered by the shared
 * detail component. `repetir` is optional on the wire (Go's `omitempty` drops
 * the key for the ~93% of anime with no repetition history), so it MUST be
 * defaulted with `?? []` here rather than assumed present. Every field the
 * Anime Detail delta spec calls out (hero, per-chapter, general data) gets an
 * explicit fallback rather than a silent blank.
 */
export function toAnimeDetailViewModel(detail: AnimeDetail): AnimeDetailViewModel {
  const repetitions = (detail.repetir ?? []).map(toAnimeRepeticionViewModel);
  const totalLabel = formatAnimeDetailTotalLabel(detail.totalcap);
  const durationLabel = formatAnimeDetailDurationLabel(detail.duracion);
  const estadoLabel = getAnimeDetailEstadoLabel(detail.estado);
  const tipoLabel = getAnimeDetailTipoLabel(detail.tipo);

  return {
    id: detail._id,
    nombre: detail.nombre,
    portadaUrl: detail.portada,
    estadoLabel,
    tipoLabel,
    subtitleLabel: formatAnimeDetailSubtitle(estadoLabel, tipoLabel),
    statusLabel: getAnimeDetailStatusLabel(detail.activo),
    statusColor: getAnimeDetailStatusColor(detail.activo),
    statTiles: buildAnimeDetailStatTiles(detail.nrocapvisto, totalLabel, durationLabel),
    progressRatio: formatAnimeDetailProgressRatio(detail.nrocapvisto, detail.totalcap),
    paginaUrl: detail.pagina,
    carpetaLabel: detail.carpeta ?? ANIME_DETAIL_UNKNOWN_LABEL,
    estrenoLabel: formatAnimeDetailLongDate(detail.fechaEstreno) ?? ANIME_DETAIL_UNKNOWN_LABEL,
    creacionLabel: formatAnimeDetailLongDate(detail.fechaCreacion) ?? ANIME_DETAIL_UNKNOWN_LABEL,
    ultCapVistoLabel: formatAnimeDetailLongDate(detail.fechaUltCapVisto) ?? ANIME_DETAIL_UNKNOWN_LABEL,
    genres: detail.generos,
    hasGenres: detail.generos.length > 0,
    studios: detail.estudios ?? ANIME_DETAIL_UNKNOWN_LABEL,
    origin: detail.origen ?? ANIME_DETAIL_UNKNOWN_LABEL,
    isFirstWatch: detail.primeravez === 1,
    repetitions,
    hasRepetitionHistory: repetitions.length > 0,
  };
}
