import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesSource } from '../../../infrastructure/preferences-source';
import { resetPreferencesStore, usePreferencesStore } from '../preferences-store';

function createSource(overrides: Partial<PreferencesSource> = {}): PreferencesSource {
  return {
    getSeasonMode: vi.fn().mockResolvedValue(false),
    setSeasonMode: vi.fn().mockResolvedValue('ok'),
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

  it('setSeasonMode updates seasonMode optimistically and persists', async () => {
    const source = createSource({ setSeasonMode: vi.fn().mockResolvedValue('ok') });

    await usePreferencesStore.getState().setSeasonMode(source, true);

    expect(usePreferencesStore.getState().seasonMode).toBe(true);
    expect(source.setSeasonMode).toHaveBeenCalledWith(true);
  });

  it('setSeasonMode reverts optimistic value and sets errorMessage when binding returns error string', async () => {
    const source = createSource({
      setSeasonMode: vi.fn().mockResolvedValue('preferences store unavailable'),
    });

    // Start from false
    await usePreferencesStore.setState({ seasonMode: false, hasLoaded: true });

    await usePreferencesStore.getState().setSeasonMode(source, true);

    expect(usePreferencesStore.getState().seasonMode).toBe(false);
    expect(usePreferencesStore.getState().errorMessage).toBe('preferences store unavailable');
  });

  it('setSeasonMode reverts optimistic value and sets errorMessage when binding rejects', async () => {
    const source = createSource({
      setSeasonMode: vi.fn().mockRejectedValue(new Error('write failed')),
    });

    await usePreferencesStore.setState({ seasonMode: false, hasLoaded: true });

    await usePreferencesStore.getState().setSeasonMode(source, true);

    expect(usePreferencesStore.getState().seasonMode).toBe(false);
    expect(usePreferencesStore.getState().errorMessage).toBe('write failed');
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
