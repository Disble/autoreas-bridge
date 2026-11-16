import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { LIBRARY_ROOT_ERROR_MESSAGE, LIBRARY_ROOT_SAVED_MESSAGE } from '../library-root-panel.constants';
import type { LibraryRootSource } from '../library-root-panel.types';
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

/**
 * Builds the Settings port double: a stored `D:/Anime`, a preview that moves nothing and a
 * successful save, unless a test overrides them. A save makes the next read answer the saved path.
 * @param overrides The calls a test spells out.
 * @returns The source.
 */
function createSource(overrides: Partial<LibraryRootSource> = {}): LibraryRootSource {
  let stored = 'D:/Anime';
  return {
    getLibraryRoot: vi.fn(() => Promise.resolve(stored)),
    setLibraryRoot: vi.fn((path: string) => {
      stored = path;
      return Promise.resolve();
    }),
    previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
    pickFolder: vi.fn().mockResolvedValue(''),
    ...overrides,
  };
}

/**
 * Renders the hook under a query wrapper whose `settings` module reports `settings`.
 * @param source The Settings port.
 * @param settings The settings module's readiness.
 * @returns The hook render and the readiness `emit`.
 */
function renderPanel(source: LibraryRootSource, settings: ModuleReadiness = status('settings', 'ready')) {
  const { wrapper, emit } = createModulesTestWrapper(settings);
  return { ...renderHook(() => useLibraryRootPanel({ source }), { wrapper }), emit };
}

/**
 * Renders the hook and waits until the stored root is shown.
 * @param source The Settings port.
 * @returns The hook render.
 */
async function renderLoaded(source: LibraryRootSource) {
  const rendered = renderPanel(source);
  await waitFor(() => expect(rendered.result.current.view.kind).toBe('ready'));
  return rendered;
}

describe('useLibraryRootPanel', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.danger.mockClear();
  });

  it('stays loading without reading while the settings module starts, then shows the stored root', async () => {
    const source = createSource();
    const { result, emit } = renderPanel(source, status('settings', 'starting'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.view.kind).toBe('loading');
    expect(result.current.root).toBe('');
    expect(source.getLibraryRoot).not.toHaveBeenCalled();

    act(() => emit(status('settings', 'ready')));

    await waitFor(() => expect(result.current.root).toBe('D:/Anime'));
    expect(result.current.view).toEqual({ kind: 'ready', data: 'D:/Anime', isRefreshing: false });
    expect(result.current.isDirty).toBe(false);
  });

  it.each([
    ['the settings module failed', status('settings', 'failed', 'settings: settings store was not wired'), createSource(), 'settings: settings store was not wired'],
    [
      'the read rejects',
      status('settings', 'ready'),
      createSource({ getLibraryRoot: vi.fn().mockRejectedValue(createBridgeError('internal', 'settings disk I/O error')) }),
      'settings disk I/O error',
    ],
  ])('shows the failure, never an unset root, when %s', async (_case, settings, source, message) => {
    const { result } = renderPanel(source, settings);

    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'failure', message }));
  });

  it('shows an unset root as an empty field, not as a missing state', async () => {
    const { result } = await renderLoaded(createSource({ getLibraryRoot: vi.fn().mockResolvedValue('') }));

    expect(result.current.view).toEqual({ kind: 'ready', data: '', isRefreshing: false });
    expect(result.current.root).toBe('');
  });

  it('is not dirty once an edit returns to the stored root', async () => {
    const { result } = await renderLoaded(createSource());

    act(() => result.current.onRootChange('E:/x'));
    act(() => result.current.onRootChange('D:/Anime'));

    expect(result.current.isDirty).toBe(false);
  });

  it.each([
    ['the preview', { previewLibraryRootChange: vi.fn(() => new Promise<never>(() => undefined)) }],
    ['the save', { setLibraryRoot: vi.fn(() => new Promise<never>(() => undefined)) }],
  ])('is saving while %s is pending', async (_step, overrides: Partial<LibraryRootSource>) => {
    const { result } = await renderLoaded(createSource(overrides));
    act(() => result.current.onRootChange('E:/x'));

    act(() => result.current.onSave());

    await waitFor(() => expect(result.current.isSaving).toBe(true));
  });

  it('marks the form dirty on change and persists the new root on save', async () => {
    const source = createSource();
    const { result } = await renderLoaded(source);

    act(() => result.current.onRootChange('E:/Media/Anime'));
    expect(result.current.isDirty).toBe(true);

    act(() => result.current.onSave());

    await waitFor(() => expect(result.current.isDirty).toBe(false));
    expect(source.previewLibraryRootChange).toHaveBeenCalledWith('E:/Media/Anime');
    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).toHaveBeenCalledWith('E:/Media/Anime');
    expect(result.current.root).toBe('E:/Media/Anime');
    expect(result.current.isSaving).toBe(false);
    expect(toastMock.success).toHaveBeenCalledWith(LIBRARY_ROOT_SAVED_MESSAGE);
  });

  it('asks for confirmation before moving active animes, and saves only on confirm', async () => {
    const source = createSource({ previewLibraryRootChange: vi.fn().mockResolvedValue(ONE_MOVE) });
    const { result } = await renderLoaded(source);
    act(() => result.current.onRootChange('F:/Anime'));
    act(() => result.current.onSave());

    await waitFor(() => expect(result.current.pendingChange).toEqual({ oldRoot: 'D:/Anime', newRoot: 'F:/Anime', moves: ONE_MOVE.moves, kept: [] }));
    expect(result.current.changeCount).toBe(1);
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);

    act(() => result.current.onConfirmChange());

    await waitFor(() => expect(result.current.isDirty).toBe(false));
    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).toHaveBeenCalledWith('F:/Anime');
  });

  it('cancels a pending change without saving', async () => {
    const source = createSource({ previewLibraryRootChange: vi.fn().mockResolvedValue(ONE_MOVE) });
    const { result } = await renderLoaded(source);
    act(() => result.current.onRootChange('F:/Anime'));
    act(() => result.current.onSave());
    await waitFor(() => expect(result.current.pendingChange).not.toBeNull());

    act(() => result.current.onCancelChange());

    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
    expect(result.current.isDirty).toBe(true);
  });

  it('drops a pending change when the confirmation closes', async () => {
    const source = createSource({ previewLibraryRootChange: vi.fn().mockResolvedValue(ONE_MOVE) });
    const { result } = await renderLoaded(source);
    act(() => result.current.onRootChange('F:/Anime'));
    act(() => result.current.onSave());
    await waitFor(() => expect(result.current.pendingChange).not.toBeNull());

    act(() => result.current.onChangeOpenChange(true));
    expect(result.current.pendingChange).not.toBeNull();

    act(() => result.current.onChangeOpenChange(false));
    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
  });

  it('surfaces a preview failure without saving', async () => {
    const source = createSource({ previewLibraryRootChange: vi.fn().mockRejectedValue(createBridgeError('internal', 'list animes: closed')) });
    const { result } = await renderLoaded(source);
    act(() => result.current.onRootChange('F:/Anime'));
    act(() => result.current.onSave());

    await waitFor(() => expect(result.current.errorMessage).toBe('list animes: closed'));
    expect(result.current.pendingChange).toBeNull();
    expect(source.setLibraryRoot).not.toHaveBeenCalled();
    expect(result.current.isSaving).toBe(false);
    expect(toastMock.danger).toHaveBeenCalledWith(LIBRARY_ROOT_ERROR_MESSAGE);
  });

  it('fills the root from the folder picker', async () => {
    const source = createSource({ getLibraryRoot: vi.fn().mockResolvedValue(''), pickFolder: vi.fn().mockResolvedValue('F:/Chosen') });
    const { result } = await renderLoaded(source);

    await act(async () => {
      await result.current.onBrowse();
    });

    expect(result.current.root).toBe('F:/Chosen');
    expect(result.current.isDirty).toBe(true);
  });

  it('ignores a cancelled folder picker', async () => {
    const { result } = await renderLoaded(createSource());

    await act(async () => {
      await result.current.onBrowse();
    });

    expect(result.current.root).toBe('D:/Anime');
    expect(result.current.isDirty).toBe(false);
  });

  it('surfaces an error and does not clear dirty when the save fails, then clears it on the next save', async () => {
    const setLibraryRoot = vi.fn().mockRejectedValueOnce(createBridgeError('internal', 'disk full')).mockResolvedValue(undefined);
    const source = createSource({ setLibraryRoot });
    const { result } = await renderLoaded(source);

    act(() => result.current.onRootChange('E:/x'));
    act(() => result.current.onSave());

    await waitFor(() => expect(result.current.errorMessage).toBe('disk full'));
    expect(result.current.isDirty).toBe(true);
    expect(toastMock.danger).toHaveBeenCalledWith(LIBRARY_ROOT_ERROR_MESSAGE);
    expect(toastMock.success).not.toHaveBeenCalled();

    act(() => result.current.onSave());

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(result.current.errorMessage).toBe('');
  });
});
