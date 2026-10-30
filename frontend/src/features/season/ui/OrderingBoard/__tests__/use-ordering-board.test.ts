import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderingBoard, SeasonOrderingSnapshot, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { ORDERING_AUTOSAVE_DEBOUNCE_MS, ORDERING_DUPLICATE_WEEKDAY_ERROR, ORDERING_HISTORY_LOAD_ERROR } from '../ordering-board.constants';
import { useOrderingBoard } from '../use-ordering-board';
import { card, createSource, dragOverEvent, snapshot, waitPastAutosave } from './ordering-board.test-support';

describe('useOrderingBoard', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('loads the board into rail + weekday columns on mount', async () => {
    const source = createSource({
      rail: [card({ animeId: 'r', section: 'Visto' })],
      grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })],
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    expect(result.current.columns['Jueves'].map((c) => c.animeId)).toEqual(['g']);
    expect(result.current.changeCount).toBe(0);
    expect(result.current.readOnly).toBe(false);
  });

  it('restores the saved draft over the applied schedule, counting its edits as changes', async () => {
    const source = createSource({
      rail: [card({ animeId: 'r', section: 'Visto' }), card({ animeId: 'kept', section: 'Visto', orden: 3 })],
      grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 }), card({ animeId: 'g', dia: 'Viernes', orden: 1 }), card({ animeId: 'still', dia: 'Martes', orden: 1 })],
      draft: JSON.stringify({
        r: [{ dia: 'Lunes', orden: 1 }, { dia: 'Sábado', orden: 1 }],
        g: [{ dia: 'Visto', orden: 2 }],
        ghost: [{ dia: 'Lunes', orden: 2 }],
      }),
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.columns['Lunes'].map((c) => c.animeId)).toEqual(['r']));
    expect(result.current.columns['Sábado'].map((c) => c.animeId)).toEqual(['r']);
    expect(result.current.columns['Jueves']).toEqual([]);
    expect(result.current.columns['Viernes']).toEqual([]);
    expect(result.current.columns['Martes'].map((c) => c.animeId)).toEqual(['still']);
    expect(result.current.rail.map((c) => [c.animeId, c.section, c.orden])).toEqual([['g', 'Visto', 2], ['kept', 'Visto', 3]]);
    expect(result.current.changeCount).toBe(2);
  });

  it.each([
    ['an applied board', { appliedAt: 1_700_000_000_000 }],
    ['a malformed draft', { draft: '{not json' }],
    ['a null draft', { draft: 'null' }],
    ['a draft entry that is not a placement list', { draft: '{"g":5}' }],
  ])('ignores the saved draft on %s', async (_name, overrides) => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })], draft: '{"g":[{"dia":"Lunes","orden":1}]}', ...overrides });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.columns['Jueves'].map((c) => c.animeId)).toEqual(['g']));
    expect(result.current.columns['Lunes']).toEqual([]);
  });

  it('resolves one cover per anime on the board, cloned cards included only once', async () => {
    const source = createSource({
      rail: [card({ animeId: 'r' })],
      grid: [card({ animeId: 'g', dia: 'Lunes' }), card({ animeId: 'g', dia: 'Jueves' })],
    });
    const getAnimeCover = vi.fn((animeId: string) => Promise.resolve({ source: 'cover', dataUrl: `data:${animeId}` }));
    const { result } = renderHook(() => useOrderingBoard(source, { getAnimeCover }));

    await waitFor(() => expect(result.current.getCoverThumb('g').coverSrc).toBe('data:g'));
    expect(result.current.getCoverThumb('r').coverSrc).toBe('data:r');
    expect(getAnimeCover.mock.calls).toEqual([['r'], ['g']]);
  });

  it.each([
    ['exposes the season store error message', 'animes failed to load', 'animes failed to load'],
    ['leaves it undefined when the store holds no error', undefined, undefined],
  ])('%s', async (_name, errorMessage, expected) => {
    setSeasonStoreState({ errorMessage });
    const source = createSource({ rail: [card({ animeId: 'r' })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    expect(result.current.errorMessage).toBe(expected);
  });

  it('reports the live board as recorded before AND after its read settles', async () => {
    let resolveBoard: (value: OrderingBoard) => void = () => undefined;
    const source = createSource(
      { rail: [], grid: [] },
      { getOrderingBoard: vi.fn(() => new Promise<OrderingBoard>((resolve) => { resolveBoard = resolve; })) },
    );

    const { result } = renderHook(() => useOrderingBoard(source));

    expect(result.current.historicalRecorded).toBe(true);
    expect(result.current.isHistoricalLoading).toBe(false);

    await act(async () => {
      resolveBoard({ rail: [card({ animeId: 'live-rail' })], grid: [] });
    });

    await waitFor(() => expect(result.current.rail.map((instance) => instance.animeId)).toEqual(['live-rail']));
    expect(result.current.historicalRecorded).toBe(true);
  });

  it('duplicate stages a rail copy and removeCard keeps the last card (min-one)', async () => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));

    act(() => result.current.duplicate('g'));
    expect(result.current.counts['g']).toBe(2);
    expect(result.current.rail.map((c) => c.animeId)).toEqual(['g']);

    const railKey = result.current.rail[0].key;
    act(() => result.current.removeCard(railKey));
    expect(result.current.counts['g']).toBe(1);

    const lunesKey = result.current.columns['Lunes'][0].key;
    act(() => result.current.removeCard(lunesKey)); // blocked: last card
    expect(result.current.columns['Lunes']).toHaveLength(1);
  });

  it('duplicate stages repeated pending rail copies from an approved rail card', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, section: instance.section, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', section: 'Visto', isPendingDuplicate: false },
      { animeId: 'g', section: '', isPendingDuplicate: true },
    ]);

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, section: instance.section, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', section: 'Visto', isPendingDuplicate: false },
      { animeId: 'g', section: '', isPendingDuplicate: true },
      { animeId: 'g', section: '', isPendingDuplicate: true },
    ]);
    expect(result.current.counts['g']).toBe(3);
  });

  it('duplicate stages repeated pending rail copies from an approved rail card with empty section', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: '', orden: 0 })], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', isPendingDuplicate: false },
      { animeId: 'g', isPendingDuplicate: true },
    ]);

    act(() => result.current.duplicate('g'));

    expect(result.current.rail.map((instance) => ({ animeId: instance.animeId, isPendingDuplicate: instance.isPendingDuplicate }))).toEqual([
      { animeId: 'g', isPendingDuplicate: false },
      { animeId: 'g', isPendingDuplicate: true },
      { animeId: 'g', isPendingDuplicate: true },
    ]);
    expect(result.current.counts['g']).toBe(3);
  });

  it('skips autosave when the working state already contains a duplicate weekday placement', async () => {
    const source = createSource({
      rail: [],
      grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 }), card({ animeId: 'g', dia: 'Lunes', orden: 2 })],
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(2));
    vi.mocked(source.saveOrderingDraft).mockClear();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ORDERING_AUTOSAVE_DEBOUNCE_MS + 50));
    });

    expect(source.saveOrderingDraft).not.toHaveBeenCalled();
  });

  it('blocks apply when the working state contains a duplicate weekday placement', async () => {
    const source = createSource({
      rail: [],
      grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 }), card({ animeId: 'g', dia: 'Lunes', orden: 2 })],
    });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(2));

    await act(async () => {
      await expect(result.current.onApply()).resolves.toEqual({ status: ORDERING_DUPLICATE_WEEKDAY_ERROR, applied: 0, failed: [] });
    });

    expect(source.saveOrderingDraft).not.toHaveBeenCalled();
    expect(source.applySchedule).not.toHaveBeenCalled();
  });

  it('cancels forbidden same-anime weekday hover before projected move state is applied', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    act(() => result.current.duplicate('g'));

    const railDuplicateKey = result.current.rail.find((instance) => instance.isPendingDuplicate)?.key;
    const juevesKey = result.current.columns['Jueves'][0]?.key;

    expect(railDuplicateKey).toBeDefined();
    expect(juevesKey).toBeDefined();

    act(() => result.current.onDragOver(dragOverEvent(railDuplicateKey!, juevesKey!)));

    expect(result.current.rail.some((instance) => instance.key === railDuplicateKey)).toBe(true);
    expect(result.current.columns['Jueves'].map((instance) => instance.animeId)).toEqual(['g']);
    expect(result.current.hasInvalidWeekdayPlacements).toBe(false);
  });

  it('keeps valid dragover behavior for allowed targets', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'other', dia: 'Jueves', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail).toHaveLength(1));

    const railSourceKey = result.current.rail[0].key;
    const juevesKey = result.current.columns['Jueves'][0].key;

    act(() => result.current.onDragOver(dragOverEvent(railSourceKey, juevesKey)));

    expect(result.current.rail).toHaveLength(0);
    expect(result.current.columns['Jueves'].map((instance) => instance.animeId)).toEqual(['g', 'other']);
  });

  it('onApply saves the serialized draft then applies the schedule', async () => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));

    await act(async () => {
      await result.current.onApply();
    });
    expect(source.saveOrderingDraft).toHaveBeenCalled();
    expect(source.applySchedule).toHaveBeenCalled();
  });

  it('marks an already-applied board read-only', async () => {
    const source = createSource({ rail: [], grid: [], appliedAt: 1_700_000_000_000 });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.readOnly).toBe(true));
  });

  it('keeps the board editable when appliedAt is null', async () => {
    const source = createSource({ rail: [], grid: [], appliedAt: null as unknown as number });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(vi.mocked(source.getOrderingBoard)).toHaveBeenCalledTimes(1));
    expect(result.current.readOnly).toBe(false);
  });

  it('reopens an applied board when reload returns appliedAt null', async () => {
    const source = createSource(
      { rail: [], grid: [], appliedAt: 1_700_000_000_000 },
      {
        getOrderingBoard: vi
          .fn<SeasonSource['getOrderingBoard']>()
          .mockResolvedValueOnce({ rail: [], grid: [], appliedAt: 1_700_000_000_000 })
          .mockResolvedValueOnce({ rail: [], grid: [], appliedAt: null as unknown as number }),
      },
    );
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.readOnly).toBe(true));

    await act(async () => {
      await result.current.onReopen();
    });

    await waitFor(() => expect(result.current.readOnly).toBe(false));
    expect(source.reopenOrdering).toHaveBeenCalledTimes(1);
    expect(source.getOrderingBoard).toHaveBeenCalledTimes(2);
    await waitPastAutosave();
    expect(source.saveOrderingDraft).not.toHaveBeenCalled();
  });

  it('loads the stored snapshot instead of the live board while viewing a past season', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const readSnapshot = vi.fn().mockResolvedValue(snapshot({
      appliedAt: 2,
      rail: [card({ animeId: 'stored-rail', section: 'Visto' })],
      grid: [card({ animeId: 'stored-grid', dia: 'Jueves', orden: 1 })],
    }));
    const source = createSource(
      { rail: [card({ animeId: 'live-only' })], grid: [] },
      { getSeasonOrderingSnapshot: readSnapshot },
    );

    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.rail.map((instance) => instance.animeId)).toEqual(['stored-rail']));
    expect(result.current.columns['Jueves'].map((instance) => instance.animeId)).toEqual(['stored-grid']);
    expect(result.current.readOnly).toBe(true);
    expect(readSnapshot).toHaveBeenCalledWith('season-old');
    expect(source.getOrderingBoard).not.toHaveBeenCalled();
  });

  it('reports the stored board as loading until a past season snapshot resolves', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    let resolveSnapshot: (value: SeasonOrderingSnapshot) => void = () => undefined;
    const readSnapshot = vi.fn(
      () => new Promise<SeasonOrderingSnapshot>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );
    const source = createSource({ rail: [], grid: [] }, { getSeasonOrderingSnapshot: readSnapshot });

    const { result } = renderHook(() => useOrderingBoard(source));
    expect(result.current.isHistoricalLoading).toBe(true);

    await act(async () => {
      resolveSnapshot(snapshot({ rail: [card({ animeId: 'stored-rail' })] }));
    });

    await waitFor(() => expect(result.current.isHistoricalLoading).toBe(false));
    expect(result.current.historicalRecorded).toBe(true);
  });

  it('re-reads the stored board when the viewed past season changes', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-a', readOnly: true });
    const readSnapshot = vi.fn((seasonId: string) => Promise.resolve(snapshot({ rail: [card({ animeId: `stored-${seasonId}` })] })));
    const source = createSource({ rail: [], grid: [] }, { getSeasonOrderingSnapshot: readSnapshot });

    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail.map((instance) => instance.animeId)).toEqual(['stored-season-a']));

    act(() => setSeasonStoreState({ viewSeasonId: 'season-b' }));

    await waitFor(() => expect(result.current.rail.map((instance) => instance.animeId)).toEqual(['stored-season-b']));
    expect(readSnapshot).toHaveBeenCalledWith('season-b');
  });

  it('stops reporting a stored-board load once the view returns to the live board', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    let resolveLiveBoard: (value: OrderingBoard) => void = () => undefined;
    const source = createSource(
      { rail: [], grid: [] },
      {
        getSeasonOrderingSnapshot: vi.fn().mockResolvedValue(snapshot({ rail: [card({ animeId: 'stored-rail' })] })),
        getOrderingBoard: vi.fn(() => new Promise<OrderingBoard>((resolve) => { resolveLiveBoard = resolve; })),
      },
    );

    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.isHistoricalLoading).toBe(false));

    act(() => setSeasonStoreState({ viewSeasonId: null }));

    expect(result.current.isHistoricalLoading).toBe(false);

    await act(async () => {
      resolveLiveBoard({ rail: [], grid: [] });
    });

    // Reset and Reopen reload the view now shown — the live board — never the past season it mounted on.
    await act(async () => {
      result.current.onReset();
    });
    await waitFor(() => expect(source.getOrderingBoard).toHaveBeenCalledTimes(2));
    await act(async () => {
      resolveLiveBoard({ rail: [], grid: [] });
    });
    await act(async () => {
      void result.current.onReopen();
    });
    await waitFor(() => expect(source.getOrderingBoard).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveLiveBoard({ rail: [], grid: [] });
    });
    expect(source.getSeasonOrderingSnapshot).toHaveBeenCalledTimes(1);
  });

  it('flags an unrecorded stored board when the past season closed before capture', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const source = createSource(
      { rail: [card({ animeId: 'live-only' })], grid: [] },
      { getSeasonOrderingSnapshot: vi.fn().mockResolvedValue(snapshot({ recorded: false })) },
    );

    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.isHistoricalLoading).toBe(false));
    expect(result.current.historicalRecorded).toBe(false);
    expect(result.current.rail).toEqual([]);
    expect(source.getOrderingBoard).not.toHaveBeenCalled();
  });

  it('surfaces a stored-board read failure as resolved and unrecorded, without falling back to the live board', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const source = createSource(
      { rail: [card({ animeId: 'live-only' })], grid: [] },
      { getSeasonOrderingSnapshot: vi.fn().mockRejectedValue(new Error('history read failed')) },
    );

    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.historicalError).toBe('history read failed'));
    expect(result.current.isHistoricalLoading).toBe(false);
    expect(result.current.historicalRecorded).toBe(false);
    expect(result.current.rail).toEqual([]);
    expect(source.getOrderingBoard).not.toHaveBeenCalled();
  });

  it('reports an unavailable snapshot read as a failure, never as an unrecorded season', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const source = createSource({ rail: [card({ animeId: 'live-only' })], grid: [] });

    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.historicalError).toBe(ORDERING_HISTORY_LOAD_ERROR));
    expect(result.current.historicalRecorded).toBe(false);
    expect(result.current.rail).toEqual([]);
    expect(source.getOrderingBoard).not.toHaveBeenCalled();
  });
});
