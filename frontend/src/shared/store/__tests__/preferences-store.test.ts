import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesSource } from '../../../infrastructure/preferences-source';
import { resetPreferencesStore, usePreferencesStore } from '../preferences-store';

function createSource(overrides: Partial<PreferencesSource> = {}): PreferencesSource {
  return {
    getSeasonMode: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe('preferences-store', () => {
  afterEach(() => {
    resetPreferencesStore();
  });

  it('starts with safe defaults: seasonMode false, hasLoaded false, no errorMessage', () => {
    const state = usePreferencesStore.getState();

    expect(state.seasonMode).toBe(false);
    expect(state.hasLoaded).toBe(false);
    expect(state.errorMessage).toBeUndefined();
  });

  it('refresh sets seasonMode and hasLoaded when the source resolves', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    await usePreferencesStore.getState().refresh(source);

    expect(usePreferencesStore.getState().seasonMode).toBe(true);
    expect(usePreferencesStore.getState().hasLoaded).toBe(true);
    expect(usePreferencesStore.getState().errorMessage).toBeUndefined();
  });

  it('refresh does not refetch if already loaded', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(false) });

    await usePreferencesStore.getState().refresh(source);
    await usePreferencesStore.getState().refresh(source);

    expect(source.getSeasonMode).toHaveBeenCalledTimes(1);
  });

  it('refresh sets errorMessage when the source rejects', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockRejectedValue(new Error('network error')) });

    await usePreferencesStore.getState().refresh(source);

    expect(usePreferencesStore.getState().hasLoaded).toBe(true);
    expect(usePreferencesStore.getState().errorMessage).toBe('network error');
  });

  it('resetPreferencesStore clears all state back to defaults', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    await usePreferencesStore.getState().refresh(source);
    resetPreferencesStore();

    expect(usePreferencesStore.getState().seasonMode).toBe(false);
    expect(usePreferencesStore.getState().hasLoaded).toBe(false);
    expect(usePreferencesStore.getState().errorMessage).toBeUndefined();
  });
});
