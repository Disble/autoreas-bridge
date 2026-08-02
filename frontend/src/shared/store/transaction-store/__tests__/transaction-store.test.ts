import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_TRANSACTION_FILTERS, TRANSACTION_STALE_PENDING_THRESHOLD_MS } from '../transaction-store.constants';
import {
  getTransactionStoreState,
  matchesStatusClass,
  matchesTransactionQuery,
  mergeTransactionPage,
  resetTransactionStore,
  selectHasPendingTransactions,
  selectVisibleTransactionRows,
  toBackendCaptureFilters,
  transactionStore,
  upsertTransactionRows,
} from '../transaction-store.helpers';
import type { CaptureRow } from '../../../contracts/capture.types';

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

  describe('matchesStatusClass', () => {
    it('matches everything for "all"', () => {
      expect(matchesStatusClass(row({ httpStatus: 500 }), 'all')).toBe(true);
      expect(matchesStatusClass(row({ httpStatus: undefined }), 'all')).toBe(true);
    });

    it('buckets by hundreds', () => {
      expect(matchesStatusClass(row({ httpStatus: 204 }), '2xx')).toBe(true);
      expect(matchesStatusClass(row({ httpStatus: 404 }), '2xx')).toBe(false);
      expect(matchesStatusClass(row({ httpStatus: 404 }), '4xx')).toBe(true);
      expect(matchesStatusClass(row({ httpStatus: 500 }), '5xx')).toBe(true);
    });

    it('never matches a non-"all" bucket when httpStatus is absent', () => {
      expect(matchesStatusClass(row({ httpStatus: undefined }), '2xx')).toBe(false);
    });
  });

  describe('matchesTransactionQuery', () => {
    it('matches everything for an empty query', () => {
      expect(matchesTransactionQuery(row(), '')).toBe(true);
    });

    it('matches route, kind, outcome, and errorCode case-insensitively', () => {
      const target = row({ route: '/api/animes/anime-1', kind: 'patch', outcome: 'accepted', errorCode: 'validation_error' });

      expect(matchesTransactionQuery(target, 'ANIME-1')).toBe(true);
      expect(matchesTransactionQuery(target, 'patch')).toBe(true);
      expect(matchesTransactionQuery(target, 'accepted')).toBe(true);
      expect(matchesTransactionQuery(target, 'validation')).toBe(true);
      expect(matchesTransactionQuery(target, 'nomatch')).toBe(false);
    });
  });

  describe('selectVisibleTransactionRows', () => {
    it('applies both statusClass and query filters together', () => {
      const items = [
        row({ requestId: 'req-1', httpStatus: 200, route: '/api/animes/anime-1' }),
        row({ requestId: 'req-2', httpStatus: 404, route: '/api/animes/anime-2' }),
      ];

      const visible = selectVisibleTransactionRows(items, {
        ...DEFAULT_TRANSACTION_FILTERS,
        statusClass: '2xx',
      });

      expect(visible).toEqual([items[0]]);
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

  describe('toBackendCaptureFilters', () => {
    it('maps route/outcome/kind and cursor/limit, omitting client-only filters', () => {
      const filters = { ...DEFAULT_TRANSACTION_FILTERS, route: '/api/animes/anime-1', outcome: 'accepted', kind: 'patch' };

      expect(toBackendCaptureFilters(filters, 'cursor-1', 25)).toEqual({
        limit: 25,
        cursor: 'cursor-1',
        route: '/api/animes/anime-1',
        outcome: 'accepted',
        kind: 'patch',
      });
    });

    it('omits empty route/outcome/kind and a null cursor', () => {
      expect(toBackendCaptureFilters(DEFAULT_TRANSACTION_FILTERS, null, 25)).toEqual({
        limit: 25,
        cursor: undefined,
        route: undefined,
        outcome: undefined,
        kind: undefined,
      });
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
