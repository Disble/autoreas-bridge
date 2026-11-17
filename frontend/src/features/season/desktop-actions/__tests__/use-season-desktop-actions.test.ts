import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimeDesktopActionsSource } from '../../../../shared/contracts/anime-editor-source.types';
import { createBridgeError } from '../../../../shared/query/bridge-error/bridge-error.helpers';
import { createBridgeQueryTestWrapper } from '../../../../shared/query/test-support/bridge-query.test-support';
import { SEASON_DESKTOP_ACTION_FAILED, SEASON_FOLDER_COPIED_TOAST, SEASON_PAGE_COPIED_TOAST } from '../season-desktop-actions.constants';
import { useSeasonDesktopActions } from '../use-season-desktop-actions';

/** Toast spy the desktop actions report their outcome through. */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), danger: vi.fn() }));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

/**
 * Builds the desktop port, every action resolving `ok` unless a case overrides it.
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

/** Every card callback, the port method it calls, and the success toast of a copy. */
const ACTIONS = [
  ['onOpenPage', 'openAnimePage', undefined],
  ['onCopyPage', 'copyAnimePage', SEASON_PAGE_COPIED_TOAST],
  ['onOpenFolder', 'openAnimeFolder', undefined],
  ['onCopyFolder', 'copyAnimeFolder', SEASON_FOLDER_COPIED_TOAST],
] as const;

/**
 * Renders the hook over a bridge query client.
 * @param source The desktop port.
 * @returns The rendered hook.
 */
function renderDesktopActions(source: AnimeDesktopActionsSource) {
  return renderHook(() => useSeasonDesktopActions(source), { wrapper: createBridgeQueryTestWrapper().wrapper });
}

describe('useSeasonDesktopActions', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(ACTIONS)('%s runs %s and toasts only a copy that worked', async (callback, action, successToast) => {
    const source = createDesktopSource();
    const { result } = renderDesktopActions(source);

    await act(async () => {
      result.current[callback]('anime-1');
    });

    await waitFor(() => expect(source[action]).toHaveBeenCalledExactlyOnceWith('anime-1'));
    await waitFor(() => expect(toastMock.success.mock.calls).toEqual(successToast === undefined ? [] : [[successToast]]));
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it.each(ACTIONS)('%s shows the bridge message of a rejected %s as a danger toast', async (callback, action) => {
    const source = createDesktopSource({ [action]: vi.fn().mockRejectedValue(createBridgeError('failed_precondition', 'anime module failed: disk')) });
    const { result } = renderDesktopActions(source);

    await act(async () => {
      result.current[callback]('anime-1');
    });

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith('anime module failed: disk'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it.each([
    ['its message', { status: 'error', message: 'no folder stored' }, 'no folder stored'],
    ['the generic failure without one', { status: 'error' }, SEASON_DESKTOP_ACTION_FAILED],
  ])('shows a non-ok result with %s as a danger toast', async (_case, answer, expected) => {
    const source = createDesktopSource({ copyAnimeFolder: vi.fn().mockResolvedValue(answer) });
    const { result } = renderDesktopActions(source);

    await act(async () => {
      result.current.onCopyFolder('anime-1');
    });

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith(expected));
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('shows the generic failure for a rejection without a message', async () => {
    const source = createDesktopSource({ openAnimePage: vi.fn().mockRejectedValue(new Error('')) });
    const { result } = renderDesktopActions(source);

    await act(async () => {
      result.current.onOpenPage('anime-1');
    });

    await waitFor(() => expect(toastMock.danger).toHaveBeenCalledExactlyOnceWith(SEASON_DESKTOP_ACTION_FAILED));
  });
});
