import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('capture-transaction-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('degrades listTransactions to an empty, degraded page when the bindings are absent', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const source = createCaptureTransactionSource();

    const pagePromise = source.listTransactions({});

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pagePromise).resolves.toEqual({
      items: [],
      appliedLimit: 0,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: true,
    });
  });

  it('degrades getTransaction to a not-found, degraded result when the bindings are absent', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const source = createCaptureTransactionSource();

    const resultPromise = source.getTransaction('req-1');

    await vi.advanceTimersByTimeAsync(5000);

    const result = await resultPromise;
    expect(result.found).toBe(false);
    expect(result.degraded).toBe(true);
  });

  it('calls ListCaptureTransactions with the mapped wire query once bindings become ready', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createCaptureTransactionSource();
    const listMock = vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    });

    const pagePromise = source.listTransactions({ route: '/api/animes/anime-1', limit: 10 });

    window.go = { desktop: { App: { ListCaptureTransactions: listMock, GetCaptureTransaction: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await pagePromise;

    expect(listMock).toHaveBeenCalledWith({
      Limit: 10,
      Cursor: '',
      Route: '/api/animes/anime-1',
      Outcome: '',
      Kind: '',
      AnimeID: '',
      ErrorCode: '',
      HTTPStatus: undefined,
      StartMS: undefined,
      EndMS: undefined,
      DeviceID: '',
      ChangelogID: undefined,
    });
  });

  it('carries the device and changelog filters to the binding, and leaves the pointer fields undefined when unset', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createCaptureTransactionSource();
    const listMock = vi.fn().mockResolvedValue({
      items: [],
      appliedLimit: 25,
      malformedRowsSkipped: 0,
      warningCount: 0,
      degraded: false,
    });

    const pagePromise = source.listTransactions({ deviceId: 'device-9', changelogId: 0, httpStatus: 404 });

    window.go = { desktop: { App: { ListCaptureTransactions: listMock, GetCaptureTransaction: vi.fn() } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await pagePromise;

    // ChangelogID 0 must survive: Go reads a missing value as a nil pointer and
    // adds no predicate, so coercing 0 away would silently drop a real filter --
    // and coercing an absent HTTPStatus to 0 would add `http_status = 0` and
    // return nothing at all.
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ DeviceID: 'device-9', ChangelogID: 0, HTTPStatus: 404, StartMS: undefined }),
    );
  });

  it('degrades summarizeTransactions to a zeroed, degraded aggregation when the bindings are absent', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const source = createCaptureTransactionSource();

    const summaryPromise = source.summarizeTransactions({});

    await vi.advanceTimersByTimeAsync(5000);

    // Zeroed and DEGRADED, never zeroed and healthy: an unreadable reader must
    // not render as "no request produced an error".
    await expect(summaryPromise).resolves.toEqual({ groups: [], degraded: true });
  });

  it('calls SummarizeCaptureTransactions with the mapped wire filters and no pagination', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createCaptureTransactionSource();
    const summarizeMock = vi.fn().mockResolvedValue({ groups: [], degraded: false });

    const summaryPromise = source.summarizeTransactions({ route: '/api/animes/anime-1', deviceId: 'device-9', changelogId: 0 });

    window.go = {
      desktop: { App: { ListCaptureTransactions: vi.fn(), GetCaptureTransaction: vi.fn(), SummarizeCaptureTransactions: summarizeMock } },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await summaryPromise;

    // An aggregation has no page, so the wire shape carries no Limit/Cursor at
    // all; ChangelogID 0 still has to survive as a real filter.
    expect(summarizeMock).toHaveBeenCalledWith({
      Route: '/api/animes/anime-1',
      Outcome: '',
      Kind: '',
      AnimeID: '',
      ErrorCode: '',
      HTTPStatus: undefined,
      StartMS: undefined,
      EndMS: undefined,
      DeviceID: 'device-9',
      ChangelogID: 0,
    });
  });

  it('calls GetCaptureTransaction with the request id once bindings become ready', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = createCaptureTransactionSource();
    const getMock = vi.fn().mockResolvedValue({
      found: true,
        item: {
          requestId: 'req-1',
          capturedAtMs: 1000,
          kind: 'patch',
          route: '/api/animes/anime-1',
          transport: 'http',
          outcome: 'accepted',
          payload: {},
          requestBody: '{"name":"x","nested":{"n":1}}',
          correlations: { operationRefs: [] },
          deviceId: 'device-1',
          deviceName: 'Phone',
      },
      degraded: false,
    });

    const resultPromise = source.getTransaction('req-1');

    window.go = { desktop: { App: { ListCaptureTransactions: vi.fn(), GetCaptureTransaction: getMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);
    await resultPromise;

    expect(getMock).toHaveBeenCalledWith('req-1');
  });

  it('shares a single singleton across multiple createCaptureTransactionSource calls', async () => {
    const { createCaptureTransactionSource } = await import('../capture-transaction-source.helpers');

    expect(createCaptureTransactionSource()).toBe(createCaptureTransactionSource());
  });

  it('reports the capture transaction runtime as unavailable when the bindings are absent', async () => {
    const { isCaptureTransactionRuntimeAvailable } = await import('../capture-transaction-source.helpers');

    expect(isCaptureTransactionRuntimeAvailable()).toBe(false);
  });

  it('reports the capture transaction runtime as available once both bindings are attached', async () => {
    const { isCaptureTransactionRuntimeAvailable } = await import('../capture-transaction-source.helpers');

    window.go = { desktop: { App: { ListCaptureTransactions: vi.fn(), GetCaptureTransaction: vi.fn() } } } as never;

    expect(isCaptureTransactionRuntimeAvailable()).toBe(true);
  });
});
