import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { useAnimeCreate } from '../use-anime-create';

/** The anime module's board, create and catalog reads, and the settings module's library root. */
const { editorSource, settingsSource, pickerSource, animeSource } = vi.hoisted(() => ({
  editorSource: {
    getAnimeEditorScheduleBoard: vi.fn(),
    createAnime: vi.fn(),
    getAnimes: vi.fn().mockResolvedValue([]),
  },
  settingsSource: { getLibraryRoot: vi.fn().mockResolvedValue('') },
  pickerSource: { pickFolder: vi.fn(), pickFile: vi.fn() },
  animeSource: { previewAnimeCover: vi.fn() },
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
  /** The rows' default native pickers. */
  get BRIDGE_PICKER_SOURCE() {
    return pickerSource;
  },
  /** The anime module's port the cover previews render through. */
  get BRIDGE_ANIME_SOURCE() {
    return animeSource;
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

  it('starts with one empty row, loads the shared board, previews covers through the anime module port, adds and removes rows never dropping below one row, patches a row field, and picks a folder through the shell picker port', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(pickerSource.pickFolder).mockResolvedValue('D:/Anime/Frieren');

    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    expect(result.current.rows).toHaveLength(1);
    expect(result.current.canRemoveRow).toBe(false);
    expect(result.current.coverPreviewSource).toBe(animeSource);

    await waitFor(() => expect(result.current.board).toEqual(emptyBoardResult.board));

    act(() => result.current.onAddRow());
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.canRemoveRow).toBe(true);

    const [firstRow] = result.current.rows;
    act(() => result.current.onRemoveRow(firstRow.draftId));
    expect(result.current.rows).toHaveLength(1);

    act(() => result.current.onRemoveRow(result.current.rows[0].draftId));
    expect(result.current.rows).toHaveLength(1);

    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren' }));
    expect(result.current.rows[0].name).toBe('Frieren');

    const draftId = result.current.rows[0].draftId;
    await act(async () => {
      result.current.onBrowseFolder(draftId);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pickerSource.pickFolder).toHaveBeenCalledWith('Select anime folder');
    expect(result.current.rows[0].folder).toBe('D:/Anime/Frieren');
  });

  it('blocks the create call with feedback for an invalid row, keeps rows with the authoritative conflict message or the rejection message, then submits one createAnime call and clears rows on a successful outcome', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.createAnime)
      .mockResolvedValueOnce({ outcome: 'conflict', message: 'existing-1 changed since the board was read', modifiedAt: 0, conflictId: 'conflict-3' } as never)
      .mockRejectedValueOnce(createBridgeError('failed_precondition', 'anime: open database: disk I/O error'))
      .mockResolvedValueOnce({ outcome: 'applied', message: 'created', animeIds: ['anime-new-1'], modifiedAt: 200 } as never);
    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });

    await act(async () => {
      await result.current.onApplyCreateSubmit({ creates: {}, changedNeighbors: [] });
    });

    expect(editorSource.createAnime).not.toHaveBeenCalled();
    expect(result.current.feedback).toBeDefined();

    await waitFor(() => expect(result.current.board).toBeDefined());
    act(() => result.current.onRowChange(result.current.rows[0].draftId, { name: 'Frieren', page: 'https://example.test/frieren' }));

    /** Submits the single row on Monday. */
    const submit = () => act(async () => {
      await result.current.onApplyCreateSubmit({
        creates: { [result.current.rows[0].draftId]: [{ day: 'Lunes', order: 1 }] },
        changedNeighbors: [],
      });
    });

    for (const feedback of ['existing-1 changed since the board was read', 'anime: open database: disk I/O error']) {
      await submit();

      expect(result.current.feedback).toBe(feedback);
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.rows).toHaveLength(1);
      expect(result.current.rows[0].name).toBe('Frieren');
    }

    await submit();

    expect(editorSource.createAnime).toHaveBeenCalledTimes(3);
    expect(editorSource.createAnime).toHaveBeenLastCalledWith({
      creates: [{ name: 'Frieren', page: 'https://example.test/frieren', placements: [{ day: 'Lunes', order: 1 }], kind: 0 }],
      changedNeighbors: [],
    });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].name).toBe('');
    expect(result.current.feedback).toBeUndefined();
  });
});

describe('useAnimeCreate name conflicts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('leaves a distinct name free to reach the schedule step, and flags a name the catalogue already holds, blocking it', async () => {
    vi.mocked(editorSource.getAnimeEditorScheduleBoard).mockResolvedValue(emptyBoardResult as never);
    vi.mocked(editorSource.getAnimes).mockResolvedValue([{ id: 'existing', name: 'Comic Girls' }] as never);

    const { result } = renderHook(() => useAnimeCreate(), { wrapper: createReadyWrapper() });
    await waitFor(() => expect(result.current.board).toBeDefined());

    const draftId = result.current.rows[0].draftId;
    act(() => result.current.onRowChange(draftId, { name: 'Sayonara Lara' }));
    act(() => result.current.onRowChange(draftId, { page: 'https://jkanime.net/sayonara-lara' }));

    await waitFor(() => expect(result.current.canOpenBoard).toBe(true));
    expect(result.current.nameConflicts[draftId]).toBeUndefined();

    act(() => result.current.onRowChange(draftId, { name: 'Comic Girls' }));
    act(() => result.current.onRowChange(draftId, { page: 'https://jkanime.net/comic-girls' }));

    await waitFor(() => expect(result.current.nameConflicts[draftId]).toBeDefined());
    expect(result.current.canOpenBoard).toBe(false);
  });
});
