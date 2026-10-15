import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryRootPanel } from '../use-library-root-panel';

/** HeroUI toast stand-in, hoisted so the module mock below can return it. */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), danger: vi.fn() }));
vi.mock('@heroui/react', () => ({ toast: toastMock }));

/** A preview where no active anime moves, so the root saves straight away. */
const NO_MOVES = { oldRoot: 'D:/Anime', moves: [], kept: [] };

/** A preview where one active anime follows the root, so the change needs confirmation. */
const ONE_MOVE = {
  oldRoot: 'D:/Anime',
  moves: [{ animeId: 'y', name: 'Yani Neko', from: 'D:/Anime/Yani Neko', to: 'F:/Anime/Yani Neko', baseModifiedAt: 1 }],
  kept: [],
};

describe('useLibraryRootPanel', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.danger.mockClear();
  });

  it('loads the current library root from the source', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn(),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));

    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));
    expect(result.current.isDirty).toBe(false);
  });

  it('marks the form dirty on change and persists the new root on save', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn().mockResolvedValue('ok'),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));

    act(() => result.current.onRootChange('E:/Media/Anime'));
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.onSave();
    });

    expect(source.previewLibraryRootChange).toHaveBeenCalledWith('E:/Media/Anime');
    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).toHaveBeenCalledWith('E:/Media/Anime');
    expect(toastMock.success).toHaveBeenCalled();
    expect(result.current.isDirty).toBe(false);
  });

  it('asks for confirmation before moving active animes, and saves only on confirm', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn().mockResolvedValue('ok'),
      previewLibraryRootChange: vi.fn().mockResolvedValue(ONE_MOVE),
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));
    act(() => result.current.onRootChange('F:/Anime'));
    await act(async () => {
      await result.current.onSave();
    });

    expect(result.current.pendingChange).toEqual({ oldRoot: 'D:/Anime', newRoot: 'F:/Anime', moves: ONE_MOVE.moves, kept: [] });
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);

    await act(async () => {
      await result.current.onConfirmChange();
    });

    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).toHaveBeenCalledWith('F:/Anime');
    expect(result.current.isDirty).toBe(false);
  });

  it('cancels a pending change without saving', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn(),
      previewLibraryRootChange: vi.fn().mockResolvedValue(ONE_MOVE),
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));
    act(() => result.current.onRootChange('F:/Anime'));
    await act(async () => {
      await result.current.onSave();
    });
    act(() => result.current.onCancelChange());

    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);
  });

  it('surfaces a preview failure without saving', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn(),
      previewLibraryRootChange: vi.fn().mockResolvedValue({ ...NO_MOVES, message: 'list animes: closed' }),
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));
    act(() => result.current.onRootChange('F:/Anime'));
    await act(async () => {
      await result.current.onSave();
    });

    expect(result.current.errorMessage).toBe('list animes: closed');
    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
    expect(toastMock.danger).toHaveBeenCalled();
  });

  it('fills the root from the folder picker', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue(''),
      setLibraryRoot: vi.fn(),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn().mockResolvedValue('F:/Chosen'),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(source.getLibraryRoot).toHaveBeenCalled());

    await act(async () => {
      await result.current.onBrowse();
    });

    expect(result.current.root).toBe('F:/Chosen');
    expect(result.current.isDirty).toBe(true);
  });

  it('ignores a cancelled folder picker', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn(),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn().mockResolvedValue(''),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));

    await act(async () => {
      await result.current.onBrowse();
    });

    expect(result.current.root).toBe('D:/Anime');
    expect(result.current.isDirty).toBe(false);
  });

  it('surfaces an error and does not clear dirty when the save fails', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn().mockResolvedValue('disk full'),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));

    act(() => result.current.onRootChange('E:/x'));
    await act(async () => {
      await result.current.onSave();
    });

    expect(result.current.errorMessage).toBe('disk full');
    expect(result.current.isDirty).toBe(true);
    expect(toastMock.danger).toHaveBeenCalled();
  });
});
