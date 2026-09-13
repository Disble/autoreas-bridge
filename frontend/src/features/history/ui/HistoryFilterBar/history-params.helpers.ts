import { ANIME_ESTADO_VALID_VALUES } from '../../../../shared/constants/anime-estado.constants';
import { HISTORY_PARAMS_ISO_LOCAL_DATE_PATTERN, HISTORY_PARAMS_TYPE_VALID_VALUES } from './history-filter-bar.constants';
import type { HistoryDateRange, HistoryParams } from './history-filter-bar.types';

/**
 * Parses one closed-domain numeric query param: an absent, non-numeric, or
 * out-of-domain value is absent, never an error (design D5).
 * @param raw The raw query param value, or `null` when absent.
 * @param validValues The closed set of numeric values this param accepts.
 * @returns The parsed value, or `undefined` when not present or invalid.
 */
function parseEnumParam(raw: string | null, validValues: readonly number[]): number | undefined {
  if (raw === null) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  return validValues.includes(parsed) ? parsed : undefined;
}

/**
 * Parses the `row` query param: a non-negative integer row ID, or absent.
 * @param raw The raw `row` query param value, or `null` when absent.
 * @returns The parsed row ID, or `undefined` when not present or invalid.
 */
function parseRowIdParam(raw: string | null): number | undefined {
  if (raw === null) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Parses the `anime` query param: a non-empty anime ID, or absent.
 * @param raw The raw `anime` query param value, or `null` when absent.
 * @returns The anime ID, or `undefined` when not present or empty.
 */
function parseAnimeIdParam(raw: string | null): string | undefined {
  return raw === null || raw === '' ? undefined : raw;
}

/**
 * Parses the `from`/`to` watched-range query params: both must be present,
 * both must be valid `YYYY-MM-DD` dates, and `from` must not be after `to`
 * (design D5). Any violation makes the whole range absent, never an error.
 * @param from The raw `from` query param value, or `null` when absent.
 * @param to The raw `to` query param value, or `null` when absent.
 * @returns The parsed range, or `undefined` when not present or invalid.
 */
function parseRangeParam(from: string | null, to: string | null): HistoryDateRange | undefined {
  if (from === null || to === null) {
    return undefined;
  }
  if (!HISTORY_PARAMS_ISO_LOCAL_DATE_PATTERN.test(from) || !HISTORY_PARAMS_ISO_LOCAL_DATE_PATTERN.test(to)) {
    return undefined;
  }
  if (from > to) {
    return undefined;
  }

  return { from, to };
}

/**
 * Converts a local calendar-day watched range into half-open epoch millis
 * (design D4): the start is inclusive and the end is exclusive, so `to` is
 * built one day past its last inclusive day. Both bounds are constructed
 * with `new Date(y, m, d)` -- the machine's own local timezone (and DST
 * where it applies) -- never a UTC or hardcoded-offset parse.
 * @param from The inclusive local start day, `YYYY-MM-DD`.
 * @param to The inclusive local end day, `YYYY-MM-DD`.
 * @returns `[fromMs, toMs)`, a half-open millisecond range.
 */
export function toLocalDayRangeMs(from: string, to: string): readonly [number, number] {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number);
  const [toYear, toMonth, toDay] = to.split('-').map(Number);

  const fromMs = new Date(fromYear, fromMonth - 1, fromDay).getTime();
  const toMs = new Date(toYear, toMonth - 1, toDay + 1).getTime();

  return [fromMs, toMs];
}

/**
 * Decodes the `/history` URL search params into `HistoryParams` (design D5).
 * Every field falls back to its default when its param is absent or holds a
 * value outside its known domain, so a tampered or stale URL never breaks
 * the History surface.
 * @param searchParams The current `/history` URL search params.
 * @returns The decoded filter and selection state.
 */
export function parseHistoryParams(searchParams: URLSearchParams): HistoryParams {
  return {
    search: searchParams.get('q') ?? '',
    status: parseEnumParam(searchParams.get('status'), ANIME_ESTADO_VALID_VALUES),
    type: parseEnumParam(searchParams.get('type'), HISTORY_PARAMS_TYPE_VALID_VALUES),
    range: parseRangeParam(searchParams.get('from'), searchParams.get('to')),
    order: searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest',
    animeId: parseAnimeIdParam(searchParams.get('anime')),
    rowId: parseRowIdParam(searchParams.get('row')),
  };
}

/**
 * Encodes `HistoryParams` back into `/history`'s URL search params (design
 * D5), omitting every field at its default value so the URL stays clean
 * when no filter, range, sort, or selection is active.
 * @param params The filter and selection state to encode.
 * @returns The encoded URL search params.
 */
export function serializeHistoryParams(params: Readonly<HistoryParams>): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.search !== '') {
    searchParams.set('q', params.search);
  }
  if (params.status !== undefined) {
    searchParams.set('status', String(params.status));
  }
  if (params.type !== undefined) {
    searchParams.set('type', String(params.type));
  }
  if (params.range !== undefined) {
    searchParams.set('from', params.range.from);
    searchParams.set('to', params.range.to);
  }
  if (params.order === 'oldest') {
    searchParams.set('sort', 'oldest');
  }
  if (params.animeId !== undefined) {
    searchParams.set('anime', params.animeId);
  }
  if (params.rowId !== undefined) {
    searchParams.set('row', String(params.rowId));
  }

  return searchParams;
}
