import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSeasonModePanel } from '../use-season-mode-panel';
import type { PreferencesSource } from '../../../../../infrastructure/preferences-source';
import { resetPreferencesStore } from '../../../../../shared/store/preferences-store';

function createSource(overrides: Partial<PreferencesSource> = {}): PreferencesSource {
  return {
    getSeasonMode: vi.fn().mockResolvedValue(false),
    setSeasonMode: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('useSeasonModePanel', () => {
  afterEach(() => {
    resetPreferencesStore();
    vi.clearAllMocks();
  });

  it('calls refresh exactly once on mount', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(false) });

    const { unmount } = renderHook(() => useSeasonModePanel(source));

    await waitFor(() => expect(source.getSeasonMode).toHaveBeenCalledTimes(1));

    unmount();
  });

  it('does not call refresh again on remount when store is already loaded', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(false) });

    const first = renderHook(() => useSeasonModePanel(source));

    await waitFor(() => expect(source.getSeasonMode).toHaveBeenCalledTimes(1));

    first.unmount();

    // Simulate remount: a second instance uses the same shared store (already loaded).
    renderHook(() => useSeasonModePanel(source));

    // Refresh guard prevents a second fetch.
    expect(source.getSeasonMode).toHaveBeenCalledTimes(1);
  });

  it('returns the correct label after loading', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    const { result } = renderHook(() => useSeasonModePanel(source));

    await waitFor(() => expect(result.current.label).toBe('Activado'));
  });

  it('toggle calls setSeasonMode and updates label', async () => {
    const source = createSource({
      getSeasonMode: vi.fn().mockResolvedValue(false),
      setSeasonMode: vi.fn().mockResolvedValue('ok'),
    });

    const { result } = renderHook(() => useSeasonModePanel(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(source.setSeasonMode).toHaveBeenCalledWith(true);
    expect(result.current.label).toBe('Activado');
  });

  it('surfaces errorMessage and reverts seasonMode when setSeasonMode returns an error', async () => {
    const source = createSource({
      getSeasonMode: vi.fn().mockResolvedValue(false),
      setSeasonMode: vi.fn().mockResolvedValue('preferences store unavailable'),
    });

    const { result } = renderHook(() => useSeasonModePanel(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.seasonMode).toBe(false);
    expect(result.current.errorMessage).toBe('preferences store unavailable');
  });

  it('does not crash when setSeasonMode rejects, and errorMessage is surfaced', async () => {
    const source = createSource({
      getSeasonMode: vi.fn().mockResolvedValue(false),
      setSeasonMode: vi.fn().mockRejectedValue(new Error('write failed')),
    });

    const { result } = renderHook(() => useSeasonModePanel(source));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggle();
    });

    expect(result.current.seasonMode).toBe(false);
    expect(result.current.errorMessage).toBe('write failed');
  });
});
