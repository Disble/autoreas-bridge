import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OrderingBoard, SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { ORDERING_AUTOSAVE_DEBOUNCE_MS } from '../ordering-board.constants';
import { useOrderingBoard } from '../use-ordering-board';
import { card, createSource, dragOverEvent, snapshot, waitPastAutosave } from './ordering-board.test-support';

/** Toast spy the desktop actions call for copy feedback. */
const toastMock = vi.hoisted(() => ({ success: vi.fn() }));

/** Runtime-source spy the desktop actions delegate to. */
const bridgeRuntimeSourceMock = vi.hoisted(() => ({
  openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
  copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
  openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
  copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: bridgeRuntimeSourceMock,
}));

/** Builds one selection row with the fields the card metadata join reads. */
function row(overrides: Partial<SeasonAnimeRow>): SeasonAnimeRow {
  return { animeId: 'g', grade: 5, pageUrl: 'https://example.test/g', folderPath: '', ...overrides } as SeasonAnimeRow;
}

describe('useOrderingBoard sub-hook behavior', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it.each([
    ['onOpenPage', 'openAnimePage', undefined],
    ['onCopyPage', 'copyAnimePage', 'Page URL copied to clipboard'],
    ['onOpenFolder', 'openAnimeFolder', undefined],
    ['onCopyFolder', 'copyAnimeFolder', 'Folder path copied to clipboard'],
  ] as const)('%s runs %s and toasts only for copies', async (callback, action, toast) => {
    const source = createSource({ rail: [], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await act(async () => {
      result.current[callback]('anime-1');
    });

    expect(bridgeRuntimeSourceMock[action]).toHaveBeenCalledExactlyOnceWith('anime-1');
    expect(toastMock.success.mock.calls).toEqual(toast === undefined ? [] : [[toast]]);
  });

  it('joins grade and desktop-action metadata from the season selection rows', async () => {
    setSeasonStoreState({ seasonAnimes: [row({}), row({ animeId: '' })], ensureAnimesLoaded: vi.fn().mockResolvedValue(undefined) });
    const source = createSource({ rail: [], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.meta['g']).toEqual({
      grade: 5, hasPage: true, hasFolder: false, pageUrl: 'https://example.test/g', folderPath: '',
    }));
    expect(Object.keys(result.current.meta)).toEqual(['g']);
  });

  it('refreshes the card metadata when the season selection rows change while mounted', async () => {
    setSeasonStoreState({ seasonAnimes: [row({})], ensureAnimesLoaded: vi.fn().mockResolvedValue(undefined) });
    const source = createSource({ rail: [], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.meta['g'].grade).toBe(5));

    act(() => setSeasonStoreState({ seasonAnimes: [row({ grade: 8, pageUrl: '', folderPath: 'D:/anime/g' })] }));

    expect(result.current.meta['g']).toEqual({ grade: 8, hasPage: false, hasFolder: true, pageUrl: '', folderPath: 'D:/anime/g' });
  });

  it('loads the season animes through the same source on mount', async () => {
    const ensureAnimesLoaded = vi.fn().mockResolvedValue(undefined);
    setSeasonStoreState({ ensureAnimesLoaded });
    const source = createSource({ rail: [], grid: [] });

    renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(ensureAnimesLoaded).toHaveBeenCalledExactlyOnceWith(source));
  });

  it('closes the season through the same source', async () => {
    const closeSeason = vi.fn().mockResolvedValue(undefined);
    setSeasonStoreState({ closeSeason });
    const source = createSource({ rail: [], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source));

    act(() => result.current.onCloseSeason());

    expect(closeSeason).toHaveBeenCalledExactlyOnceWith(source);
  });

  it('onReset discards the working edits and the saved draft, then re-reads the board', async () => {
    const applied = { rail: [card({ animeId: 'g', section: 'Visto' })], grid: [] };
    const source = createSource(applied, {
      getOrderingBoard: vi.fn()
        .mockResolvedValueOnce({ ...applied, draft: '{"g":[{"dia":"Lunes","orden":1}]}' })
        .mockResolvedValue({ ...applied, draft: '' }),
    });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));
    act(() => result.current.duplicate('g'));
    expect(result.current.rail).toHaveLength(1);

    await act(async () => {
      result.current.onReset();
    });

    await waitFor(() => expect(result.current.rail.map((c) => c.animeId)).toEqual(['g']));
    expect(result.current.columns['Lunes']).toEqual([]);
    expect(source.getOrderingBoard).toHaveBeenCalledTimes(2);
    // The pending autosave of the discarded edit never fires: '{}' is the only write.
    await waitPastAutosave();
    expect(vi.mocked(source.saveOrderingDraft).mock.calls).toEqual([['{}']]);
  });

  it('onApply saves the draft, applies the schedule, re-reads the board and returns the result', async () => {
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));
    vi.mocked(source.getOrderingBoard).mockClear();

    let applied: Awaited<ReturnType<typeof result.current.onApply>> | undefined;
    await act(async () => {
      applied = await result.current.onApply();
    });

    expect(applied).toEqual({ status: 'ok', applied: 1, failed: [] });
    expect(source.saveOrderingDraft).toHaveBeenCalledWith(expect.stringContaining('"Lunes"'));
    expect(source.getOrderingBoard).toHaveBeenCalledTimes(1);
    // The reloaded board is the applied schedule; it is never autosaved back as a draft.
    await waitPastAutosave();
    expect(source.saveOrderingDraft).toHaveBeenCalledTimes(1);
  });

  it.each<[string, (current: ReturnType<typeof useOrderingBoard>) => void]>([
    ['a duplicate', (current) => current.duplicate('g')],
    ['a remove', (current) => current.removeCard(current.rail[0].key)],
    ['a drag', (current) => current.onDragOver(dragOverEvent(current.rail[0].key, current.columns['Jueves'][0].key))],
  ])('autosaves the serialized draft only after %s, once the debounce elapses', async (_name, edit) => {
    vi.useFakeTimers();
    // A board read slower than the debounce must not let the empty pre-load state
    // overwrite the saved draft, and the loaded board itself is never re-saved.
    let resolveBoard: (board: OrderingBoard) => void = () => undefined;
    const source = createSource({ rail: [], grid: [] }, {
      getOrderingBoard: vi.fn(() => new Promise<OrderingBoard>((resolve) => { resolveBoard = resolve; })),
    });
    const { result } = renderHook(() => useOrderingBoard(source));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERING_AUTOSAVE_DEBOUNCE_MS * 2);
    });
    await act(async () => {
      resolveBoard({ rail: [card({ animeId: 'g', section: 'Visto' })], grid: [card({ animeId: 'other', dia: 'Jueves', orden: 1 })] });
      await vi.advanceTimersByTimeAsync(ORDERING_AUTOSAVE_DEBOUNCE_MS * 2);
    });
    expect(result.current.rail).toHaveLength(1);
    expect(source.saveOrderingDraft).not.toHaveBeenCalled();

    act(() => edit(result.current));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERING_AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(source.saveOrderingDraft).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(source.saveOrderingDraft).toHaveBeenCalledTimes(1);
  });

  it('never autosaves a read-only board', async () => {
    vi.useFakeTimers();
    const source = createSource({ rail: [], grid: [], appliedAt: 1_700_000_000_000 });
    renderHook(() => useOrderingBoard(source));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    vi.mocked(source.saveOrderingDraft).mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ORDERING_AUTOSAVE_DEBOUNCE_MS * 2);
    });

    expect(source.saveOrderingDraft).not.toHaveBeenCalled();
  });

  it('counts scheduled cards and changes after a card is dragged onto a weekday', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'other', dia: 'Jueves', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    expect([result.current.scheduledCount, result.current.changeCount]).toEqual([1, 0]);

    act(() => result.current.onDragOver(dragOverEvent(result.current.rail[0].key, result.current.columns['Jueves'][0].key)));

    expect([result.current.scheduledCount, result.current.changeCount]).toEqual([2, 2]);
  });

  it('marks a stored board that carries appliedAt read-only even when the store is not read-only', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: false });
    const source = createSource({ rail: [], grid: [] }, { getSeasonOrderingSnapshot: vi.fn().mockResolvedValue(snapshot({ appliedAt: 2 })) });
    const { result } = renderHook(() => useOrderingBoard(source));

    await waitFor(() => expect(result.current.readOnly).toBe(true));
  });

  it.each([
    ['the live board', null],
    ['another stored season that reads', 'season-b'],
  ])('clears a previous stored-board failure once %s loads', async (_name, nextView) => {
    setSeasonStoreState({ viewSeasonId: 'season-a', readOnly: true });
    const readSnapshot = vi.fn((seasonId: string) => (seasonId === 'season-a' ? Promise.reject(new Error('history read failed')) : Promise.resolve(snapshot())));
    const source = createSource({ rail: [], grid: [] }, { getSeasonOrderingSnapshot: readSnapshot });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.historicalError).toBe('history read failed'));

    act(() => setSeasonStoreState({ viewSeasonId: nextView }));

    await waitFor(() => expect(result.current.historicalError).toBeUndefined());
  });

  it('prevents the drag-over default when the hover is a forbidden same-anime weekday', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })] });
    const { result } = renderHook(() => useOrderingBoard(source));
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    act(() => result.current.duplicate('g'));
    const event = dragOverEvent(result.current.rail.find((instance) => instance.isPendingDuplicate)!.key, result.current.columns['Jueves'][0].key);

    act(() => result.current.onDragOver(event));

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});
