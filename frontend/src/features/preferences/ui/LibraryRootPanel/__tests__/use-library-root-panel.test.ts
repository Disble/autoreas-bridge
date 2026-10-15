import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryRootPanel } from '../use-library-root-panel';

/** HeroUI toast stand-in, hoisted so the module mock below can return it. */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), danger: vi.fn() }));
vi.mock('@heroui/react', () => ({ toast: toastMock }));

describe('useLibraryRootPanel', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.danger.mockClear();
  });

  it('loads the current library root from the source', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn(),
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
      pickFolder: vi.fn(),
    };

    const { result } = renderHook(() => useLibraryRootPanel({ source }));
    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));

    act(() => result.current.onRootChange('E:/Media/Anime'));
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.onSave();
    });

    expect(source.setLibraryRoot).toHaveBeenCalledWith('E:/Media/Anime');
    expect(toastMock.success).toHaveBeenCalled();
    expect(result.current.isDirty).toBe(false);
  });

  it('fills the root from the folder picker', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue(''),
      setLibraryRoot: vi.fn(),
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
