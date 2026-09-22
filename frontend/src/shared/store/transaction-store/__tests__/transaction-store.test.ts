import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TRANSACTION_FILTERS, TRANSACTION_STALE_PENDING_THRESHOLD_MS } from '../transaction-store.constants';
import {
  getTransactionStoreState,
  matchesTransactionFilters,
  mergeTransactionPage,
  resetTransactionStore,
  selectHasPendingTransactions,
  toBackendCaptureFilters,
  transactionStore,
  upsertTransactionRows,
} from '../transaction-store.helpers';
import type { CaptureRow } from '../../../contracts/capture.types';

/** Builds one capture row, overridable field by field per test. */
function row(overrides: Partial<CaptureRow> = {}): CaptureRow {
  return {
    requestId: 'req-1',
    capturedAtMs: 1000,
    kind: 'patch',
    route: '/api/animes/anime-1',
    transport: 'http',
    outcome: 'accepted',
    ...overrides,
  };
}

describe('transaction-store.helpers', () => {
  describe('mergeTransactionPage', () => {
    it('replaces the buffer in "replace" mode', () => {
      const existing = [row({ requestId: 'req-1' })];
      const incoming = [row({ requestId: 'req-2' })];

      expect(mergeTransactionPage(existing, incoming, 'replace')).toEqual(incoming);
    });

    it('appends after the existing buffer in "append" mode', () => {
      const existing = [row({ requestId: 'req-1' })];
      const incoming = [row({ requestId: 'req-2' })];

      expect(mergeTransactionPage(existing, incoming, 'append')).toEqual([...existing, ...incoming]);
    });
  });

  describe('upsertTransactionRows', () => {
    it('prepends an unseen row without disturbing existing order', () => {
      const existing = [row({ requestId: 'req-1' }), row({ requestId: 'req-2' })];
      const incoming = [row({ requestId: 'req-3' })];

      expect(upsertTransactionRows(existing, incoming).map((item) => item.requestId)).toEqual(['req-3', 'req-1', 'req-2']);
    });

    it('updates a pending row to its terminal state in place, preserving position', () => {
      const pending = row({ requestId: 'req-1', outcome: 'pending', durationMs: undefined, httpStatus: undefined });
      const other = row({ requestId: 'req-2' });
      const existing = [other, pending];
      const terminal = row({ requestId: 'req-1', outcome: 'accepted', durationMs: 12, httpStatus: 200 });

      const result = upsertTransactionRows(existing, [terminal]);

      expect(result.map((item) => item.requestId)).toEqual(['req-2', 'req-1']);
      expect(result[1]).toEqual(terminal);
    });

    it('never creates a duplicate row for the same requestId', () => {
      const existing = [row({ requestId: 'req-1', outcome: 'pending' })];
      const terminal = row({ requestId: 'req-1', outcome: 'accepted' });

      const result = upsertTransactionRows(existing, [terminal]);

      expect(result).toHaveLength(1);
    });
  });

  describe('selectHasPendingTransactions', () => {
    it('reports true when at least one row is pending', () => {
      const items = [row({ outcome: 'accepted' }), row({ requestId: 'req-2', outcome: 'pending' })];

      expect(selectHasPendingTransactions(items, 1000)).toBe(true);
    });

    it('reports false when no row is pending', () => {
      expect(selectHasPendingTransactions([row({ outcome: 'accepted' })], 1000)).toBe(false);
    });

    it('reports false for an empty item list', () => {
      expect(selectHasPendingTransactions([])).toBe(false);
    });

    it('stops reporting a pending row once it is older than the staleness window, so the elapsed clock can stop', () => {
      const capturedAtMs = 1_000_000;
      const stale = [row({ outcome: 'pending', capturedAtMs })];

      expect(selectHasPendingTransactions(stale, capturedAtMs + TRANSACTION_STALE_PENDING_THRESHOLD_MS - 1)).toBe(true);
      expect(selectHasPendingTransactions(stale, capturedAtMs + TRANSACTION_STALE_PENDING_THRESHOLD_MS)).toBe(false);
    });
  });

  describe('matchesTransactionFilters', () => {
    /** The default filters every table row starts from, one override per case. */
    const baseFilters = { ...DEFAULT_TRANSACTION_FILTERS };

    it.each([
      [
        'applies no route predicate when the route filter is unset',
        { route: '' },
        row(),
        true,
      ],
      [
        'matches a route by partial substring',
        { route: 'seasons' },
        row({ route: '/api/seasons/active' }),
        true,
      ],
      [
        'matches a middle route fragment',
        { route: 'sync/' },
        row({ route: '/api/sync/reconcile' }),
        true,
      ],
      [
        'matches a route case-insensitively',
        { route: 'ANIMES' },
        row({ route: '/api/animes' }),
        true,
      ],
      [
        'treats a literal % in the route filter as a literal, never a wildcard',
        { route: '%api%' },
        row({ route: '/api/animes' }),
        false,
      ],
      [
        'rejects a route that does not contain the fragment',
        { route: 'animes' },
        row({ route: '/ws' }),
        false,
      ],
      [
        'applies no outcome predicate when the outcome filter is unset',
        { outcome: '' },
        row({ outcome: 'rejected' }),
        true,
      ],
      [
        'matches an outcome by case-insensitive substring',
        { outcome: 'REJECT' },
        row({ outcome: 'rejected' }),
        true,
      ],
      [
        'rejects a non-matching outcome',
        { outcome: 'accepted' },
        row({ outcome: 'rejected' }),
        false,
      ],
      [
        'applies no kind predicate when the kind filter is unset',
        { kind: '' },
        row({ kind: 'post' }),
        true,
      ],
      [
        'matches a kind by case-insensitive substring',
        { kind: 'PATCH' },
        row({ kind: 'patch' }),
        true,
      ],
      [
        'rejects a non-matching kind',
        { kind: 'post' },
        row({ kind: 'patch' }),
        false,
      ],
      [
        'applies no status predicate when the status filter is unset',
        { httpStatus: null },
        row({ httpStatus: undefined }),
        true,
      ],
      [
        'matches the exact chosen status',
        { httpStatus: 200 },
        row({ httpStatus: 200 }),
        true,
      ],
      [
        'rejects a row whose status differs from the chosen one',
        { httpStatus: 404 },
        row({ httpStatus: 200 }),
        false,
      ],
      [
        'rejects a row with no status at all when a status is chosen',
        { httpStatus: 200 },
        row({ httpStatus: undefined }),
        false,
      ],
      [
        'applies no anime predicate when the anime filter is unset',
        { animeId: '' },
        row({ animeId: undefined }),
        true,
      ],
      [
        'matches the exact anime id',
        { animeId: 'anime-1' },
        row({ animeId: 'anime-1' }),
        true,
      ],
      [
        'rejects a different anime id',
        { animeId: 'anime-1' },
        row({ animeId: 'anime-2' }),
        false,
      ],
      [
        'applies no error-code predicate when the error-code filter is unset',
        { errorCode: '' },
        row({ errorCode: undefined }),
        true,
      ],
      [
        'matches the exact error code',
        { errorCode: 'conflict' },
        row({ errorCode: 'conflict' }),
        true,
      ],
      [
        'rejects a row with no error code when one is chosen',
        { errorCode: 'conflict' },
        row({ errorCode: undefined }),
        false,
      ],
      [
        'applies no lower time bound when startMs is unset',
        { startMs: null },
        row({ capturedAtMs: 500 }),
        true,
      ],
      [
        'admits an instant before the epoch when startMs is unset, because an absent bound is not a bound of zero',
        { startMs: null },
        row({ capturedAtMs: -5_000 }),
        true,
      ],
      [
        'admits a row at the lower time bound',
        { startMs: 1000 },
        row({ capturedAtMs: 1000 }),
        true,
      ],
      [
        'rejects a row before the lower time bound',
        { startMs: 2000 },
        row({ capturedAtMs: 1999 }),
        false,
      ],
      [
        'applies no upper time bound when endMs is unset',
        { endMs: null },
        row({ capturedAtMs: 99_999 }),
        true,
      ],
      [
        'admits a row at the upper time bound',
        { endMs: 1000 },
        row({ capturedAtMs: 1000 }),
        true,
      ],
      [
        'rejects a row after the upper time bound',
        { endMs: 1000 },
        row({ capturedAtMs: 1001 }),
        false,
      ],
      [
        'rejects every row while a device filter is set: the pushed row cannot vouch for a device',
        { deviceId: 'device-9' },
        row(),
        false,
      ],
      [
        'rejects every row while a changelog filter is set: the push carries no correlations envelope',
        { changelogId: 77 },
        row(),
        false,
      ],
    ])('%s', (_caseName, filterOverrides, candidate, expected) => {
      expect(matchesTransactionFilters(candidate, { ...baseFilters, ...filterOverrides })).toBe(expected);
    });
  });

  describe('toBackendCaptureFilters', () => {
    it('sends every active filter to the backend, so nothing is narrowed over the loaded rows', () => {
      const filters = {
        route: '/api/animes/anime-1',
        outcome: 'accepted',
        kind: 'patch',
        animeId: 'anime-1',
        errorCode: 'conflict',
        deviceId: 'device-9',
        httpStatus: 404,
        changelogId: 77,
        startMs: 1_700_000_000_000,
        endMs: 1_700_000_600_000,
      };

      expect(toBackendCaptureFilters(filters, 'cursor-1', 25)).toEqual({
        limit: 25,
        cursor: 'cursor-1',
        route: '/api/animes/anime-1',
        outcome: 'accepted',
        kind: 'patch',
        animeId: 'anime-1',
        errorCode: 'conflict',
        deviceId: 'device-9',
        httpStatus: 404,
        changelogId: 77,
        startMs: 1_700_000_000_000,
        endMs: 1_700_000_600_000,
      });
    });

    it('omits every unset filter and a null cursor', () => {
      expect(toBackendCaptureFilters(DEFAULT_TRANSACTION_FILTERS, null, 25)).toEqual({
        limit: 25,
        cursor: undefined,
        route: undefined,
        outcome: undefined,
        kind: undefined,
        animeId: undefined,
        errorCode: undefined,
        deviceId: undefined,
        httpStatus: undefined,
        changelogId: undefined,
        startMs: undefined,
        endMs: undefined,
      });
    });

    it('sends no status at all when the status filter is unset, so NULL-status transports survive', () => {
      // 537 of 1,317 stored captures (measured 2026-08-30) are websocket rows
      // carrying no HTTP status. The backend adds `http_status = ?` only when a
      // status arrives, so coercing an unset status into a concrete number here
      // would erase every one of them from the tab.
      const backend = toBackendCaptureFilters({ ...DEFAULT_TRANSACTION_FILTERS, httpStatus: null }, null, 25);

      expect(backend.httpStatus).toBeUndefined();
    });

    it('keeps a changelog id of 0, which is a real filter rather than an absent one', () => {
      const backend = toBackendCaptureFilters({ ...DEFAULT_TRANSACTION_FILTERS, changelogId: 0 }, null, 25);

      expect(backend.changelogId).toBe(0);
    });

    it('keeps a start bound of 0 rather than dropping it as falsy', () => {
      const backend = toBackendCaptureFilters({ ...DEFAULT_TRANSACTION_FILTERS, startMs: 0 }, null, 25);

      expect(backend.startMs).toBe(0);
    });
  });
});

describe('transactionStore', () => {
  afterEach(() => {
    resetTransactionStore();
  });

  it('starts with an empty buffer, no selection, and isLoading true', () => {
    const state = getTransactionStoreState();

    expect(state.items).toEqual([]);
    expect(state.nextCursor).toBeNull();
    expect(state.selectedId).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.degraded).toBe(false);
  });

  it('setPage replaces the buffer and stores the next cursor', () => {
    transactionStore.getState().setPage([row({ requestId: 'req-1' })], 'cursor-1', 'replace');

    const state = getTransactionStoreState();
    expect(state.items).toHaveLength(1);
    expect(state.nextCursor).toBe('cursor-1');
  });

  it('setPage appends onto the existing buffer in "append" mode', () => {
    transactionStore.getState().setPage([row({ requestId: 'req-1' })], 'cursor-1', 'replace');
    transactionStore.getState().setPage([row({ requestId: 'req-2' })], 'cursor-2', 'append');

    const state = getTransactionStoreState();
    expect(state.items.map((item) => item.requestId)).toEqual(['req-1', 'req-2']);
    expect(state.nextCursor).toBe('cursor-2');
  });

  it('upsertRows prepends a new row and preserves the current selection', () => {
    transactionStore.getState().setPage([row({ requestId: 'req-1' })], 'cursor-1', 'replace');
    transactionStore.getState().select('req-1');

    transactionStore.getState().upsertRows([row({ requestId: 'req-2', outcome: 'pending' })]);

    const state = getTransactionStoreState();
    expect(state.items.map((item) => item.requestId)).toEqual(['req-2', 'req-1']);
    expect(state.selectedId).toBe('req-1');
  });

  it('upsertRows transitions a pending row to terminal in place without duplicating it', () => {
    transactionStore.getState().setPage([row({ requestId: 'req-1', outcome: 'pending' })], null, 'replace');

    transactionStore.getState().upsertRows([row({ requestId: 'req-1', outcome: 'accepted', httpStatus: 200, durationMs: 10 })]);

    const state = getTransactionStoreState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].outcome).toBe('accepted');
  });

  it('setFilters merges a partial filter update', () => {
    transactionStore.getState().setFilters({ route: '/api/animes/anime-1' });

    expect(getTransactionStoreState().filters).toEqual({ ...DEFAULT_TRANSACTION_FILTERS, route: '/api/animes/anime-1' });
  });

  it('select updates selectedId and clears any previous selectedDetail', () => {
    transactionStore.getState().setSelectedDetail({
      requestId: 'req-1',
      capturedAtMs: 1000,
      kind: 'patch',
      route: '/api/animes/anime-1',
      transport: 'http',
      outcome: 'accepted',
      payload: {},
      correlations: { operationRefs: [] },
      deviceId: 'device-1',
      deviceName: 'Phone',
    });

    transactionStore.getState().select('req-2');

    const state = getTransactionStoreState();
    expect(state.selectedId).toBe('req-2');
    expect(state.selectedDetail).toBeNull();
  });

  it('setDegraded propagates the degraded flag', () => {
    transactionStore.getState().setDegraded(true);

    expect(getTransactionStoreState().degraded).toBe(true);
  });

  it('reset restores the initial state', () => {
    transactionStore.getState().setPage([row()], 'cursor-1', 'replace');
    transactionStore.getState().select('req-1');
    transactionStore.getState().setDegraded(true);

    resetTransactionStore();

    const state = getTransactionStoreState();
    expect(state.items).toEqual([]);
    expect(state.selectedId).toBeNull();
    expect(state.degraded).toBe(false);
  });
});
