import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import { useAnimeCreate } from '../use-anime-create';

vi.mock('../../../../../infrastructure/bridge-runtime-source', () => ({
  bridgeRuntimeSource: {
    getAnimeEditorScheduleBoard: vi.fn(),
    createAnime: vi.fn(),
    pickFolder: vi.fn(),
  },
}));

const emptyBoardResult = {
  outcome: 'applied',
  message: 'loaded',
  board: { originAnimeId: '', boardModifiedAt: 100, destinations: [{ id: 'Lunes', label: 'Lunes', kind: 'weekday' }], entries: [] },
};

describe('useAnimeCreate', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts with one empty row and loads the shared board', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);

    const { result } = renderHook(() => useAnimeCreate());

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.canRemoveRow).toBe(false);

    await waitFor(() => expect(result.current.board).toEqual(emptyBoardResult.board));
  });

  it('adds and removes rows, never dropping below one row', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    const { result } = renderHook(() => useAnimeCreate());

    act(() => result.current.onAddRow());
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.canRemoveRow).toBe(true);

    const [firstRow] = result.current.rows;
    act(() => result.current.onRemoveRow(firstRow.draftId));
    expect(result.current.rows).toHaveLength(1);

    act(() => result.current.onRemoveRow(result.current.rows[0].draftId));
    expect(result.current.rows).toHaveLength(1);
  });

  it('picks a folder for the given row via the runtime source', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(bridgeRuntimeSource.pickFolder).mockResolvedValue('D:/Anime/Frieren');
    const { result } = renderHook(() => useAnimeCreate());
    const draftId = result.current.rows[0].draftId;

    await act(async () => {
      result.current.onBrowseFolder(draftId);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bridgeRuntimeSource.pickFolder).toHaveBeenCalledWith('Select anime folder');
    expect(result.current.rows[0].folder).toBe('D:/Anime/Frieren');
  });

  it('patches a row field via onRowChange', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    const { result } = renderHook(() => useAnimeCreate());

    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren' }));
    expect(result.current.rows[0].name).toBe('Frieren');
  });

  it('blocks the create call and sets feedback when a row is invalid', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    const { result } = renderHook(() => useAnimeCreate());

    await act(async () => {
      await result.current.onApplyCreateSubmit({ creates: {}, changedNeighbors: [] });
    });

    expect(bridgeRuntimeSource.createAnime).not.toHaveBeenCalled();
    expect(result.current.feedback).toBeDefined();
  });

  it('submits one createAnime call and clears rows on a successful outcome', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(bridgeRuntimeSource.createAnime!).mockResolvedValue({ outcome: 'applied', message: 'created', animeIds: ['anime-new-1'], modifiedAt: 200 } as never);
    const { result } = renderHook(() => useAnimeCreate());

    await waitFor(() => expect(result.current.board).toBeDefined());
    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren', page: 'https://example.test/frieren' }));

    await act(async () => {
      await result.current.onApplyCreateSubmit({
        creates: { [result.current.rows[0].draftId]: [{ day: 'Lunes', order: 1 }] },
        changedNeighbors: [],
      });
    });

    expect(bridgeRuntimeSource.createAnime).toHaveBeenCalledTimes(1);
    expect(bridgeRuntimeSource.createAnime).toHaveBeenCalledWith({
      creates: [{ name: 'Frieren', page: 'https://example.test/frieren', placements: [{ day: 'Lunes', order: 1 }] }],
      changedNeighbors: [],
    });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('');
    expect(result.current.feedback).toBeUndefined();
  });

  it('surfaces the authoritative message and keeps rows on a conflict/error outcome', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(bridgeRuntimeSource.createAnime!).mockResolvedValue({ outcome: 'error', message: 'boom', modifiedAt: 0 } as never);
    const { result } = renderHook(() => useAnimeCreate());

    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren', page: 'https://example.test/frieren' }));

    await act(async () => {
      await result.current.onApplyCreateSubmit({
        creates: { [result.current.rows[0].draftId]: [{ day: 'Lunes', order: 1 }] },
        changedNeighbors: [],
      });
    });

    expect(result.current.feedback).toBe('boom');
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('Frieren');
  });
});
