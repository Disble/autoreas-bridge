import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimeDesktopActionsSource } from '../../../../../shared/contracts/anime-editor-source.types';
import type { OrderingBoard, SeasonAnimeRow } from '../../../../../shared/contracts/season.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_ANIMES_KEY } from '../../../../../shared/query/query-keys/query-keys.constants';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { ORDERING_AUTOSAVE_DEBOUNCE_MS } from '../ordering-board.constants';
import { useOrderingBoard } from '../use-ordering-board';
import { card, createSource, dragOverEvent, installAutosaveClock, orderingQueryWrapper, renderOrderingBoard, snapshot, waitPastAutosave } from './ordering-board.test-support';
import { createSeasonDataSource, makeSeason, makeSeasonRow, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { useDisplayedSeason } from '../../../../../shared/season/use-displayed-season';
import { useOrderingBoardStoreBindings } from '../use-ordering-board-store-bindings';

/** Toast spy the desktop actions report their outcome through. */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), danger: vi.fn() }));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

/**
 * Builds the anime desktop-actions port the board's cards run through.
 * @param overrides The actions a case replaces.
 * @returns The fake port.
 */
function createDesktopSource(overrides: Partial<AnimeDesktopActionsSource> = {}): AnimeDesktopActionsSource {
  return {
    openAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    copyAnimePage: vi.fn().mockResolvedValue({ status: 'ok' }),
    openAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    copyAnimeFolder: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  };
}

/** Cover port with no binding: every card renders the placeholder. */
const NO_COVERS = {};

/** Builds one selection row with the fields the card metadata join reads. */
function row(overrides: Partial<SeasonAnimeRow>): SeasonAnimeRow {
  return { animeId: 'g', grade: 5, pageUrl: 'https://example.test/g', folderPath: '', ...overrides } as SeasonAnimeRow;
}

describe('useOrderingBoard sub-hook behavior', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it.each([
    ['onOpenPage', 'openAnimePage', undefined],
    ['onCopyPage', 'copyAnimePage', 'Page URL copied to clipboard'],
    ['onOpenFolder', 'openAnimeFolder', undefined],
    ['onCopyFolder', 'copyAnimeFolder', 'Folder path copied to clipboard'],
  ] as const)('%s runs %s and toasts only for copies', async (callback, action, toast) => {
    const source = createSource({ rail: [], grid: [] });
    const desktop = createDesktopSource();
    const { result } = renderHook(() => useOrderingBoard(source, NO_COVERS, desktop), { wrapper: orderingQueryWrapper([]).wrapper });

    await act(async () => {
      result.current[callback]('anime-1');
    });

    await waitFor(() => expect(desktop[action]).toHaveBeenCalledExactlyOnceWith('anime-1'));
    await waitFor(() => expect(toastMock.success.mock.calls).toEqual(toast === undefined ? [] : [[toast]]));
  });

  it('shows a rejected desktop action as a danger toast with the bridge message', async () => {
    const source = createSource({ rail: [], grid: [] });
    const desktop = createDesktopSource({ openAnimeFolder: vi.fn().mockRejectedValue(createBridgeError('invalid_argument', 'anime g has no folder')) });
    const { result } = renderHook(() => useOrderingBoard(source, NO_COVERS, desktop), { wrapper: orderingQueryWrapper([]).wrapper });

    await act(async () => {
      result.current.onOpenFolder('g');
    });

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith('anime g has no folder'));
  });

  it('joins grade and desktop-action metadata from the season selection rows', async () => {
    const source = createSource({ rail: [], grid: [] });
    const { result } = renderHook(() => useOrderingBoard(source), { wrapper: orderingQueryWrapper([row({}), row({ animeId: '' })]).wrapper });

    await waitFor(() => expect(result.current.meta['g']).toEqual({
      grade: 5, hasPage: true, hasFolder: false, pageUrl: 'https://example.test/g', folderPath: '',
    }));
    expect(Object.keys(result.current.meta)).toEqual(['g']);
  });

  it('refreshes the card metadata when the season selection rows change while mounted', async () => {
    const source = createSource({ rail: [], grid: [] });
    const { client, wrapper } = orderingQueryWrapper([row({})]);
    const { result } = renderHook(() => useOrderingBoard(source), { wrapper });
    await waitFor(() => expect(result.current.meta['g'].grade).toBe(5));

    act(() => client.setQueryData(SEASON_ANIMES_KEY, [row({ grade: 8, pageUrl: '', folderPath: 'D:/anime/g' })]));

    await waitFor(() => expect(result.current.meta['g']).toEqual({ grade: 8, hasPage: false, hasFolder: true, pageUrl: '', folderPath: 'D:/anime/g' }));
  });

  it('loads the season animes through the season read on mount', async () => {
    const readSeasonAnimes = vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockResolvedValue([]);
    const source = createSource({ rail: [], grid: [] });

    renderHook(() => useOrderingBoard(source), { wrapper: orderingQueryWrapper(null).wrapper });

    await waitFor(() => expect(readSeasonAnimes).toHaveBeenCalledTimes(1));
  });

  it('closes the season through the season command', async () => {
    const closeSeason = vi.spyOn(BRIDGE_SEASON_SOURCE, 'closeSeason').mockResolvedValue('ok');
    vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeason').mockResolvedValue(null);
    const source = createSource({ rail: [], grid: [] });
    const { result } = renderOrderingBoard(source);

    act(() => result.current.onCloseSeason());

    await waitFor(() => expect(closeSeason).toHaveBeenCalledTimes(1));
  });

  it('onReset discards the working edits and the saved draft, then re-reads the board', async () => {
    installAutosaveClock();
    const applied = { rail: [card({ animeId: 'g', section: 'Visto' })], grid: [] };
    const source = createSource(applied, {
      fetchOrderingBoard: vi.fn()
        .mockResolvedValueOnce({ ...applied, draft: '{"g":[{"dia":"Lunes","orden":1}]}' })
        .mockResolvedValue({ ...applied, draft: '' }),
    });
    const { result } = renderOrderingBoard(source);
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));
    act(() => result.current.duplicate('g'));
    expect(result.current.rail).toHaveLength(1);

    await act(async () => {
      result.current.onReset();
    });

    await waitFor(() => expect(result.current.rail.map((c) => c.animeId)).toEqual(['g']));
    expect(result.current.columns['Lunes']).toEqual([]);
    expect(source.fetchOrderingBoard).toHaveBeenCalledTimes(2);
    // The pending autosave of the discarded edit never fires: '{}' is the only write.
    await waitPastAutosave();
    expect(vi.mocked(source.saveOrderingDraft).mock.calls).toEqual([['{}']]);
  });

  it('onReset discards the working edits even when the re-read board comes back unchanged', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto' })], grid: [] });
    const { result } = renderOrderingBoard(source);
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    act(() => result.current.duplicate('g'));
    expect(result.current.rail).toHaveLength(2);

    await act(async () => {
      result.current.onReset();
    });

    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    expect(source.fetchOrderingBoard).toHaveBeenCalledTimes(2);
  });

  it('onApply saves the draft, applies the schedule, re-reads the board and returns the result', async () => {
    installAutosaveClock();
    const source = createSource({ rail: [], grid: [card({ animeId: 'g', dia: 'Lunes', orden: 1 })] });
    const { result } = renderOrderingBoard(source);
    await waitFor(() => expect(result.current.columns['Lunes']).toHaveLength(1));
    vi.mocked(source.fetchOrderingBoard!).mockClear();

    let applied: Awaited<ReturnType<typeof result.current.onApply>> | undefined;
    await act(async () => {
      applied = await result.current.onApply();
    });

    expect(applied).toEqual({ status: 'ok', applied: 1, failed: [] });
    expect(source.saveOrderingDraft).toHaveBeenCalledWith(expect.stringContaining('"Lunes"'));
    expect(source.fetchOrderingBoard).toHaveBeenCalledTimes(1);
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
      fetchOrderingBoard: vi.fn(() => new Promise<OrderingBoard>((resolve) => { resolveBoard = resolve; })),
    });
    const { result } = renderOrderingBoard(source);
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
    renderOrderingBoard(source);
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
    const { result } = renderOrderingBoard(source);
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    expect([result.current.scheduledCount, result.current.changeCount]).toEqual([1, 0]);

    act(() => result.current.onDragOver(dragOverEvent(result.current.rail[0].key, result.current.columns['Jueves'][0].key)));

    expect([result.current.scheduledCount, result.current.changeCount]).toEqual([2, 2]);
  });

  it('marks a stored board that carries appliedAt read-only even when the store is not read-only', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: false });
    const source = createSource({ rail: [], grid: [] }, { fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(snapshot({ appliedAt: 2 })) });
    const { result } = renderOrderingBoard(source);

    await waitFor(() => expect(result.current.readOnly).toBe(true));
  });

  it.each([
    ['the live board', null],
    ['another stored season that reads', 'season-b'],
  ])('clears a previous stored-board failure once %s loads', async (_name, nextView) => {
    setSeasonStoreState({ viewSeasonId: 'season-a', readOnly: true });
    const readSnapshot = vi.fn((seasonId: string) => (seasonId === 'season-a' ? Promise.reject(new Error('history read failed')) : Promise.resolve(snapshot())));
    const source = createSource({ rail: [], grid: [] }, { fetchSeasonOrderingSnapshot: readSnapshot });
    const { result } = renderOrderingBoard(source);
    await waitFor(() => expect(result.current.historicalError).toBe('history read failed'));

    act(() => setSeasonStoreState({ viewSeasonId: nextView }));

    await waitFor(() => expect(result.current.historicalError).toBeUndefined());
  });

  it('prevents the drag-over default when the hover is a forbidden same-anime weekday', async () => {
    const source = createSource({ rail: [card({ animeId: 'g', section: 'Visto', orden: 2 })], grid: [card({ animeId: 'g', dia: 'Jueves', orden: 1 })] });
    const { result } = renderOrderingBoard(source);
    await waitFor(() => expect(result.current.rail).toHaveLength(1));
    act(() => result.current.duplicate('g'));
    const event = dragOverEvent(result.current.rail.find((instance) => instance.isPendingDuplicate)!.key, result.current.columns['Jueves'][0].key);

    act(() => result.current.onDragOver(event));

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

/**
 * Renders the bindings next to a reader of the displayed season, every read through `source`.
 * @param source The port the reads and the close command go through.
 * @returns The render result.
 */
function renderBindings(source: ReturnType<typeof createSeasonDataSource>) {
  return renderHook(
    () => ({ bindings: useOrderingBoardStoreBindings(source), season: useDisplayedSeason({ refresh: 'mount', source }) }),
    { wrapper: seasonQueryWrapper().wrapper },
  );
}

describe('useOrderingBoardStoreBindings', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads the open season rows once and keeps the same empty list until they arrive', async () => {
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow()]) });
    const { result, rerender } = renderBindings(source);
    const before = result.current.bindings.seasonAnimes;
    rerender();

    expect(result.current.bindings.seasonAnimes).toBe(before);
    expect(before).toEqual([]);
    await waitFor(() => expect(result.current.bindings.seasonAnimes).toHaveLength(1));
    await act(() => expect(result.current.bindings.ensureAnimesLoaded()).resolves.toBeUndefined());
    expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('passes the store view state and banner through', () => {
    setSeasonStoreState({ readOnly: true, viewSeasonId: 'old', errorMessage: 'earlier failure' });
    const { result } = renderBindings(createSeasonDataSource());

    expect(result.current.bindings).toMatchObject({ readOnly: true, viewSeasonId: 'old', errorMessage: 'earlier failure' });
  });

  it('shows the fixed banner text when the rows fail to load', async () => {
    renderBindings(createSeasonDataSource({ readSeasonAnimes: vi.fn().mockRejectedValue(new Error('rows down')) }));

    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('Failed to load intake rows'));
  });

  it('closes the season through the command and reads the season again', async () => {
    const readSeason = vi.fn().mockResolvedValueOnce(makeSeason()).mockResolvedValue(null);
    const source = createSeasonDataSource({ readSeason });
    const { result } = renderBindings(source);
    await waitFor(() => expect(result.current.season.data).toEqual(makeSeason()));

    await act(() => result.current.bindings.closeSeason());

    expect(source.closeSeason).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.season.data).toBeNull());
  });
});
