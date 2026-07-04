import type { AnimeHistoryEntry } from '../../../../shared/contracts/anime.types';
import { HISTORY_TABLE_ESTADO_ALL_VALUE } from './history-table.constants';
import type { HeroChipColor, HistoryPageItem, HistoryRowViewModel } from './history-table.types';

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

// Hoisted per react-doctor/js-hoist-intl: constructing an Intl.DateTimeFormat
// is expensive, so it must not happen on every format call.
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'long' });

/** Zero-pads a number to a two-digit string, mirroring `datetime.helpers.ts`'s `padTwo`. */
function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formats epoch millis as a long-form local date (e.g. "June 30, 2026"),
 * exceeding the Legacy floor per the "History Timestamps Read Well" spec.
 */
export function formatHistoryLongDate(millis: number): string {
  return LONG_DATE_FORMATTER.format(new Date(millis));
}

/** Formats epoch millis as a local weekday name (e.g. "Tuesday"). */
export function formatHistoryWeekday(millis: number): string {
  return WEEKDAY_FORMATTER.format(new Date(millis));
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

/**
 * Formats epoch millis as a relative recency label (e.g. "Today",
 * "Yesterday", "2 days ago"), aiding fast scanning per the "History
 * Timestamps Read Well" spec. `now` defaults to the current time and is
 * overridable for deterministic tests.
 */
export function formatHistoryRelativeRecency(millis: number, now: number = Date.now()): string {
  const dayDiff = Math.round((startOfLocalDay(now) - startOfLocalDay(millis)) / MILLIS_PER_DAY);

  if (dayDiff <= 0) {
    return 'Today';
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  return `${dayDiff} days ago`;
}

/**
 * Estado label domain verified against `ANIME_ESTADO_OPTIONS`
 * (`catalog-panel.constants.ts`): 0=Viendo, 1=Finalizado, 2=Abandonado,
 * 3=Pendiente. Falls back to the raw estado for any unrecognized value
 * rather than inventing a label.
 */
export function getHistoryEstadoLabel(estado: number): string {
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
 * Semantic HeroUI chip color per estado: Viendo (in progress) is the
 * accent/ongoing color, Finalizado (completed) is success, Abandonado
 * (dropped) is danger, Pendiente (not yet started) is warning. Unknown
 * estados fall back to the neutral default color.
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
 * Composable name-search + estado filter over the server-sorted History
 * list (design Decision 2: pagination/search/filter happen client-side over
 * the full sorted list). Both filters can be applied independently or
 * together; passing an empty query or the "all" estado sentinel skips that
 * filter.
 */
export function filterHistoryEntries(
  entries: readonly AnimeHistoryEntry[],
  searchQuery: string,
  estadoFilter: string,
): readonly AnimeHistoryEntry[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return entries.filter((entry) => {
    const matchesEstado = estadoFilter === HISTORY_TABLE_ESTADO_ALL_VALUE || String(entry.estado) === estadoFilter;
    const matchesQuery = normalizedQuery === '' || entry.nombre.toLowerCase().includes(normalizedQuery);

    return matchesEstado && matchesQuery;
  });
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
    nombre: entry.nombre,
    nrocapvisto: entry.nrocapvisto,
    longDateLabel: formatHistoryLongDate(entry.fechaUltCapVisto),
    weekdayLabel: formatHistoryWeekday(entry.fechaUltCapVisto),
    timeLabel: formatHistoryTime(entry.fechaUltCapVisto),
    relativeRecencyLabel: formatHistoryRelativeRecency(entry.fechaUltCapVisto),
    estado: entry.estado,
    estadoLabel: getHistoryEstadoLabel(entry.estado),
    estadoColor: getHistoryEstadoColor(entry.estado),
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
