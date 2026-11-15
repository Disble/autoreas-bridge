import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { useAnimeCreate } from '../use-anime-create';

/** The anime module's board, create and catalog reads, and the settings module's library root. */
const { editorSource, settingsSource } = vi.hoisted(() => ({
  editorSource: {
    getAnimeEditorScheduleBoard: vi.fn(),
    createAnime: vi.fn(),
    getAnimes: vi.fn().mockResolvedValue([]),
  },
  settingsSource: { getLibraryRoot: vi.fn().mockResolvedValue('') },
}));

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: { pickFolder: vi.fn() },
}));

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The create hooks' default anime-module port. */
  get BRIDGE_ANIME_EDITOR_SOURCE() {
    return editorSource;
  },
  /** The create bootstrap's default settings port. */
  get BRIDGE_SETTINGS_SOURCE() {
    return settingsSource;
  },
}));

/**
 * A query client whose `anime` and `settings` modules are ready, so the board,
 * the catalog and the library root read at once.
 * @returns The wrapper; build one per render.
 */
function createReadyWrapper() {
  return createModulesTestWrapper(status('anime', 'ready'), status('settings', 'ready')).wrapper;
}

/** A loaded schedule board with one weekday and no existing entries, so the cases
 * exercise placement without any stored anime getting in the way. */
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
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);

    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.canRemoveRow).toBe(false);

    await waitFor(() => expect(result.current.board).toEqual(emptyBoardResult.board));
  });

  it('adds and removes rows, never dropping below one row', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

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
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(bridgeRuntimeSource.pickFolder).mockResolvedValue('D:/Anime/Frieren');
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });
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
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren' }));
    expect(result.current.rows[0].name).toBe('Frieren');
  });

  it('blocks the create call and sets feedback when a row is invalid', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    await act(async () => {
      await result.current.onApplyCreateSubmit({ creates: {}, changedNeighbors: [] });
    });

    expect(editorSource.createAnime).not.toHaveBeenCalled();
    expect(result.current.feedback).toBeDefined();
  });

  it('submits one createAnime call and clears rows on a successful outcome', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.createAnime).mockResolvedValue({ outcome: 'applied', message: 'created', animeIds: ['anime-new-1'], modifiedAt: 200 } as never);
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    await waitFor(() => expect(result.current.board).toBeDefined());
    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren', page: 'https://example.test/frieren' }));

    await act(async () => {
      await result.current.onApplyCreateSubmit({
        creates: { [result.current.rows[0].draftId]: [{ day: 'Lunes', order: 1 }] },
        changedNeighbors: [],
      });
    });

    expect(editorSource.createAnime).toHaveBeenCalledTimes(1);
    expect(editorSource.createAnime).toHaveBeenCalledWith({
      creates: [{ name: 'Frieren', page: 'https://example.test/frieren', placements: [{ day: 'Lunes', order: 1 }], kind: 0 }],
      changedNeighbors: [],
    });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('');
    expect(result.current.feedback).toBeUndefined();
  });

  it('surfaces the authoritative message and keeps rows on a conflict outcome', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.createAnime).mockResolvedValue({ outcome: 'conflict', message: 'existing-1 changed since the board was read', modifiedAt: 0, conflictId: 'conflict-3' } as never);
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren', page: 'https://example.test/frieren' }));

    await act(async () => {
      await result.current.onApplyCreateSubmit({
        creates: { [result.current.rows[0].draftId]: [{ day: 'Lunes', order: 1 }] },
        changedNeighbors: [],
      });
    });

    expect(result.current.feedback).toBe('existing-1 changed since the board was read');
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('Frieren');
  });

  it('surfaces the rejection message and keeps rows when the anime module rejects the create', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.createAnime).mockRejectedValue(createBridgeError('failed_precondition', 'anime: open database: disk I/O error'));
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren', page: 'https://example.test/frieren' }));

    await act(async () => {
      await result.current.onApplyCreateSubmit({
        creates: { [result.current.rows[0].draftId]: [{ day: 'Lunes', order: 1 }] },
        changedNeighbors: [],
      });
    });

    expect(result.current.feedback).toBe('anime: open database: disk I/O error');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('Frieren');
  });
});

describe('useAnimeCreate name conflicts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('flags a name the catalogue already holds and blocks the schedule step', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.getAnimes).mockResolvedValue([{ id: 'existing', name: 'Comic Girls' }] as never);

    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });
    await waitFor(() => expect(result.current.board).toBeDefined());

    const draftId = result.current.rows[0].draftId;
    act(() => result.current.onRowChange(draftId, { name: 'Comic Girls' }));
    act(() => result.current.onRowChange(draftId, { page: 'https://jkanime.net/comic-girls' }));

    await waitFor(() => expect(result.current.nameConflicts[draftId]).toBeDefined());
    expect(result.current.canOpenBoard).toBe(false);
  });

  it('leaves a distinct name free to reach the schedule step', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.getAnimes).mockResolvedValue([{ id: 'existing', name: 'Comic Girls' }] as never);

    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });
    await waitFor(() => expect(result.current.board).toBeDefined());

    const draftId = result.current.rows[0].draftId;
    act(() => result.current.onRowChange(draftId, { name: 'Sayonara Lara' }));
    act(() => result.current.onRowChange(draftId, { page: 'https://jkanime.net/sayonara-lara' }));

    await waitFor(() => expect(result.current.canOpenBoard).toBe(true));
    expect(result.current.nameConflicts[draftId]).toBeUndefined();
  });
});
