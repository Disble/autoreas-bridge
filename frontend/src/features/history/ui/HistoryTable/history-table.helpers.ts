import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import type { AnimeHistoryEntry } from '../../../../shared/contracts/anime.types';
import {
  HISTORY_TABLE_ESTADO_ALL_VALUE,
  HISTORY_TABLE_ESTADO_OPTIONS,
  HISTORY_TABLE_DAYS_PER_MONTH,
  HISTORY_TABLE_LONG_DATE_FORMATTER,
  HISTORY_TABLE_MILLIS_PER_DAY,
  HISTORY_TABLE_MONTHS_PER_YEAR,
  HISTORY_TABLE_SORT_FECHA_CREACION_VALUE,
  HISTORY_TABLE_SORT_NOMBRE_VALUE,
  HISTORY_TABLE_SORT_OPTIONS,
  HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
  HISTORY_TABLE_TIPO_ALL_VALUE,
  HISTORY_TABLE_TIPO_OPTIONS,
  HISTORY_TABLE_WEEKDAY_FORMATTER,
} from './history-table.constants';
import type { HeroChipColor, HistoryPageItem, HistoryParamsState, HistoryRowViewModel } from './history-table.types';

/** Zero-pads a number to a two-digit string, mirroring `datetime.helpers.ts`'s `padTwo`. */
function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formats epoch millis as a long-form local date (e.g. "June 30, 2026"),
 * exceeding the Legacy floor per the "History Timestamps Read Well" spec.
 */
export function formatHistoryLongDate(millis: number): string {
  return HISTORY_TABLE_LONG_DATE_FORMATTER.format(new Date(millis));
}

/** Formats epoch millis as a local weekday name (e.g. "Tuesday"). */
export function formatHistoryWeekday(millis: number): string {
  return HISTORY_TABLE_WEEKDAY_FORMATTER.format(new Date(millis));
}

/** Formats epoch millis as a local, zero-padded 24-hour `HH:MM` time (e.g. "12:12"). */
export function formatHistoryTime(millis: number): string {
  const date = new Date(millis);

  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

/**
 * Truncates a `Date` down to local midnight so day-difference math compares
 * calendar days rather than 24-hour windows (e.g. 11pm to 1am the next day
 * is "Yesterday", not "Today").
 */
function startOfLocalDay(millis: number): number {
  const date = new Date(millis);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Counts completed calendar months between two local calendar days. */
function getCalendarMonthDiff(millis: number, now: number): number {
  const date = new Date(millis);
  const current = new Date(now);
  let monthDiff =
    (current.getFullYear() - date.getFullYear()) * HISTORY_TABLE_MONTHS_PER_YEAR +
    current.getMonth() -
    date.getMonth();

  if (current.getDate() < date.getDate()) {
    monthDiff -= 1;
  }

  return Math.max(0, monthDiff);
}

/**
 * Formats epoch millis as a relative recency label (e.g. "Today", "2 days
 * ago", "1 year 2 months ago"), aiding fast scanning per the "History
 * Timestamps Read Well" spec. `now` defaults to the current time and is
 * overridable for deterministic tests.
 */
export function formatHistoryRelativeRecency(millis: number, now: number = Date.now()): string {
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(millis)) / HISTORY_TABLE_MILLIS_PER_DAY);

  if (dayDiff <= 0) {
    return 'Today';
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }

  if (dayDiff < HISTORY_TABLE_DAYS_PER_MONTH) {
    return `${dayDiff} days ago`;
  }

  const monthDiff = Math.max(
    1,
    getCalendarMonthDiff(startOfLocalDay(millis), startOfLocalDay(now)),
  );
  const years = Math.floor(monthDiff / HISTORY_TABLE_MONTHS_PER_YEAR);
  const months = monthDiff % HISTORY_TABLE_MONTHS_PER_YEAR;

  if (years > 0) {
    const yearLabel = years === 1 ? '1 year' : `${years} years`;
    let monthLabel = '';

    if (months === 1) {
      monthLabel = ' 1 month';
    }

    // Stryker disable next-line EqualityOperator: months === 1 is handled above, making >= 1 equivalent here.
    if (months > 1) {
      monthLabel = ` ${months} months`;
    }

    return `${yearLabel}${monthLabel} ago`;
  }

  return `${monthDiff} month${monthDiff === 1 ? '' : 's'} ago`;
}

/**
 * Estado label from the canonical shared vocabulary
 * (`shared/helpers/anime-estado.helpers.ts`): 0=Viendo, 1=Finalizado, 2=No me gusto,
 * 3=En pausa. Falls back to the raw estado for any unrecognized value.
 */
export function getHistoryEstadoLabel(estado: number): string {
  return getAnimeEstadoLabel(estado);
}

/**
 * Semantic HeroUI chip color per estado: Viendo (in progress) is the
 * accent/ongoing color, Finalizado (completed) is success, No me gusto
 * (disliked) is danger, En pausa (paused) is warning. Unknown estados fall
 * back to the neutral default color.
 */
export function getHistoryEstadoColor(estado: number): HeroChipColor {
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
 * Composable name-search + estado + tipo filter over the server-sorted
 * History list (design Decision 2: pagination/search/filter happen
 * client-side over the full sorted list). Every filter can be applied
 * independently or together; passing an empty query or an "all" sentinel
 * skips that filter. An entry with an absent `tipo` only matches the "all"
 * tipo filter, never a specific tipo value.
 */
export function filterHistoryEntries(
  entries: readonly AnimeHistoryEntry[],
  searchQuery: string,
  estadoFilter: string,
  tipoFilter: string,
): readonly AnimeHistoryEntry[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesEstado = estadoFilter === HISTORY_TABLE_ESTADO_ALL_VALUE || String(entry.status) === estadoFilter;
    const matchesQuery = normalizedQuery === '' || entry.name.toLowerCase().includes(normalizedQuery);
    const matchesTipo = tipoFilter === HISTORY_TABLE_TIPO_ALL_VALUE || String(entry.kind) === tipoFilter;

    return matchesEstado && matchesQuery && matchesTipo;
  });
}

/**
 * Sorts filtered entries per the visible "Sort" control (spec: Orden),
 * applied AFTER filtering and BEFORE pagination. The default
 * `ult-cap-visto` value keeps the input order untouched -- the server
 * already returns entries DESC by `fechaUltCapVisto`, so no client re-sort
 * is needed. Never mutates `entries`.
 */
export function sortHistoryEntries(
  entries: readonly AnimeHistoryEntry[],
  sort: string,
): readonly AnimeHistoryEntry[] {
  if (sort === HISTORY_TABLE_SORT_NOMBRE_VALUE) {
    return entries.toSorted((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  if (sort === HISTORY_TABLE_SORT_FECHA_CREACION_VALUE) {
    return entries.toSorted((a, b) => {
      if (a.createdAt === undefined && b.createdAt === undefined) {
        return 0;
      }
      if (a.createdAt === undefined) {
        return 1;
      }
      if (b.createdAt === undefined) {
        return -1;
      }
      return b.createdAt - a.createdAt;
    });
  }

  return entries;
}

/** Returns `true` when `value` is one of `options`' values, used to validate URL query params against a known domain. */
function isKnownOptionValue(value: string, options: readonly { readonly value: string }[]): boolean {
  return options.some((option) => option.value === value);
}

/**
 * Parses the `/history` URL query string into `HistoryParamsState` (spec:
 * "History State Survives Navigation"). Every field falls back to its
 * default when the param is absent or holds a value outside its known
 * domain, so a tampered or stale URL never breaks the table.
 */
export function parseHistoryParams(searchParams: URLSearchParams): HistoryParamsState {
  const estado = searchParams.get('estado') ?? HISTORY_TABLE_ESTADO_ALL_VALUE;
  const tipo = searchParams.get('tipo') ?? HISTORY_TABLE_TIPO_ALL_VALUE;
  const sort = searchParams.get('sort') ?? HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE;
  const rawPage = searchParams.get('page');
  const parsedPage = rawPage === null ? Number.NaN : Number.parseInt(rawPage, 10);

  return {
    q: searchParams.get('q') ?? '',
    estado: isKnownOptionValue(estado, HISTORY_TABLE_ESTADO_OPTIONS) ? estado : HISTORY_TABLE_ESTADO_ALL_VALUE,
    tipo: isKnownOptionValue(tipo, HISTORY_TABLE_TIPO_OPTIONS) ? tipo : HISTORY_TABLE_TIPO_ALL_VALUE,
    sort: isKnownOptionValue(sort, HISTORY_TABLE_SORT_OPTIONS) ? sort : HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
    page: Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1,
  };
}

/**
 * Serializes `HistoryParamsState` back into a query string, omitting every
 * field at its default value so the `/history` URL stays clean when no
 * filter/search/sort/page is active (design D2).
 */
export function serializeHistoryParams(state: HistoryParamsState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.q !== '') {
    params.set('q', state.q);
  }
  if (state.estado !== HISTORY_TABLE_ESTADO_ALL_VALUE) {
    params.set('estado', state.estado);
  }
  if (state.tipo !== HISTORY_TABLE_TIPO_ALL_VALUE) {
    params.set('tipo', state.tipo);
  }
  if (state.sort !== HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE) {
    params.set('sort', state.sort);
  }
  if (state.page !== 1) {
    params.set('page', String(state.page));
  }

  return params;
}

/** Returns the total page count for `itemCount` items at `pageSize` per page, never less than 1. */
export function getHistoryTotalPages(itemCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

/** Maps a single `AnimeHistoryEntry` into its table row view model, given its 1-based row number. */
function toHistoryRowViewModel(entry: AnimeHistoryEntry, rowNumber: number): HistoryRowViewModel {
  return {
    id: entry.id,
    rowNumber,
    nombre: entry.name,
    nrocapvisto: entry.episodesWatched,
    longDateLabel: formatHistoryLongDate(entry.lastWatchedAt),
    weekdayLabel: formatHistoryWeekday(entry.lastWatchedAt),
    timeLabel: formatHistoryTime(entry.lastWatchedAt),
    relativeRecencyLabel: formatHistoryRelativeRecency(entry.lastWatchedAt),
    estado: entry.status,
    estadoLabel: getHistoryEstadoLabel(entry.status),
    estadoColor: getHistoryEstadoColor(entry.status),
  };
}

/**
 * Slices `entries` (already filtered/sorted) to the requested 1-based
 * `page` and builds each row's view model, numbering rows by their position
 * in the FULL list so numbering stays continuous across pages rather than
 * resetting to 1 on every page.
 */
export function paginateHistoryEntries(
  entries: readonly AnimeHistoryEntry[],
  page: number,
  pageSize: number,
): readonly HistoryRowViewModel[] {
  const start = (page - 1) * pageSize;

  return entries.slice(start, start + pageSize).map((entry, index) => toHistoryRowViewModel(entry, start + index + 1));
}

/**
 * Builds the numbered-pagination item list for the current page: all pages
 * when there are 7 or fewer, otherwise a window of first page, last page,
 * and current page +/-1, with 'ellipsis' markers filling any gap larger
 * than one page (Legacy Historial shows numbered pages; the windowing keeps
 * the control compact at 2026-UX density).
 */
export function getHistoryPageItems(currentPage: number, totalPages: number): readonly HistoryPageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const anchors = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...anchors].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);

  const items: HistoryPageItem[] = [];
  for (const [index, page] of pages.entries()) {
    if (index > 0 && page - pages[index - 1] > 1) {
      items.push('ellipsis');
    }
    items.push(page);
  }
  return items;
}
