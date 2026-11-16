import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleReadiness } from '../../../../../shared/contracts/readiness.types';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { AUTO_START_ERROR_MESSAGE, AUTO_START_SAVED_MESSAGE } from '../auto-start-panel.constants';
import type { AutoStartSource } from '../auto-start-panel.types';
import { useAutoStartPanel } from '../use-auto-start-panel';

/** Toast stub, hoisted so the HeroUI module mock can close over it. */
const toastMock = vi.hoisted(() => ({ success: vi.fn(), danger: vi.fn() }));

vi.mock('@heroui/react', () => ({ toast: toastMock }));

/**
 * Builds the Settings port double: auto-start off and a successful save unless a test overrides them.
 * @param overrides The calls a test spells out.
 * @returns The source.
 */
function createSource(overrides: Partial<AutoStartSource> = {}): AutoStartSource {
  return { getAutoStartEnabled: vi.fn().mockResolvedValue(false), setAutoStartEnabled: vi.fn().mockResolvedValue(undefined), ...overrides };
}

/**
 * Renders the hook under a query wrapper whose `settings` module reports `settings`.
 * @param source The Settings port.
 * @param settings The settings module's readiness.
 * @returns The hook render and the readiness `emit`.
 */
function renderPanel(source: AutoStartSource, settings: ModuleReadiness = status('settings', 'ready')) {
  const { wrapper, emit } = createModulesTestWrapper(settings);
  return { ...renderHook(() => useAutoStartPanel({ source }), { wrapper }), emit };
}

describe('useAutoStartPanel', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
    toastMock.danger.mockClear();
  });

  it('stays loading without reading while the settings module starts, then shows the stored preference', async () => {
    const source = createSource();
    const { result, emit } = renderPanel(source, status('settings', 'starting'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(result.current.view.kind).toBe('loading');
    expect(source.getAutoStartEnabled).not.toHaveBeenCalled();

    act(() => emit(status('settings', 'ready')));

    await waitFor(() => expect(result.current.view).toEqual({ kind: 'ready', data: false, isRefreshing: false }));
  });

  it.each([
    ['the settings module failed', status('settings', 'failed', 'settings: settings store was not wired'), createSource(), 'settings: settings store was not wired'],
    [
      'the read rejects',
      status('settings', 'ready'),
      createSource({ getAutoStartEnabled: vi.fn().mockRejectedValue(createBridgeError('internal', 'settings disk I/O error')) }),
      'settings disk I/O error',
    ],
  ])('shows the failure, never a default preference, when %s', async (_case, settings, source, message) => {
    const { result } = renderPanel(source, settings);

    await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'failure', message }));
  });

  it('saves a changed preference, toasts it and shows the value read back', async () => {
    const getAutoStartEnabled = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const source = createSource({ getAutoStartEnabled });
    const { result } = renderPanel(source);
    await waitFor(() => expect(result.current.view.kind).toBe('ready'));

    act(() => result.current.onEnabledChange(true));

    await waitFor(() => expect(result.current.view).toEqual({ kind: 'ready', data: true, isRefreshing: false }));
    expect(source.setAutoStartEnabled).toHaveBeenCalledWith(true);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.errorMessage).toBe('');
    expect(toastMock.success).toHaveBeenCalledWith(AUTO_START_SAVED_MESSAGE);
  });

  it('keeps the stored preference and shows the failure when the save rejects', async () => {
    const source = createSource({ setAutoStartEnabled: vi.fn().mockRejectedValue(createBridgeError('internal', 'registry unavailable')) });
    const { result } = renderPanel(source);
    await waitFor(() => expect(result.current.view.kind).toBe('ready'));

    act(() => result.current.onEnabledChange(true));

    await waitFor(() => expect(result.current.errorMessage).toBe('registry unavailable'));
    expect(result.current.view).toMatchObject({ kind: 'ready', data: false });
    expect(toastMock.danger).toHaveBeenCalledWith(AUTO_START_ERROR_MESSAGE);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('is saving while the save runs', async () => {
    let finishSave: () => void = () => undefined;
    const pendingSave = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const source = createSource({ setAutoStartEnabled: vi.fn().mockReturnValue(pendingSave) });
    const { result } = renderPanel(source);
    await waitFor(() => expect(result.current.view.kind).toBe('ready'));

    act(() => result.current.onEnabledChange(true));

    await waitFor(() => expect(result.current.isSaving).toBe(true));
    await act(async () => {
      finishSave();
      await pendingSave;
    });
    await waitFor(() => expect(result.current.isSaving).toBe(false));
  });
});
