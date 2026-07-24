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

    window.go = { main: { App: { ListCaptureTransactions: listMock, GetCaptureTransaction: vi.fn() } } } as never;

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
        correlations: { operationRefs: [] },
        deviceId: 'device-1',
        deviceName: 'Phone',
      },
      degraded: false,
    });

    const resultPromise = source.getTransaction('req-1');

    window.go = { main: { App: { ListCaptureTransactions: vi.fn(), GetCaptureTransaction: getMock } } } as never;

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

    window.go = { main: { App: { ListCaptureTransactions: vi.fn(), GetCaptureTransaction: vi.fn() } } } as never;

    expect(isCaptureTransactionRuntimeAvailable()).toBe(true);
  });
});
