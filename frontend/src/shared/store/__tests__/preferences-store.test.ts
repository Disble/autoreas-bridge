import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesSource } from '../../../infrastructure/preferences-source';
import { getPreferencesStoreState, resetPreferencesStore } from '../preferences-store';

it('keeps the state interface in the colocated types module', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const storePath = join(process.cwd(), 'src/shared/store/preferences-store/preferences-store.ts');
  const sourceText = readFileSync(storePath, 'utf8');

  expect(sourceText).not.toMatch(/interface\s+PreferencesStoreState\b/);
});

function createSource(overrides: Partial<PreferencesSource> = {}): PreferencesSource {
  return {
    getSeasonMode: vi.fn().mockResolvedValue(false),
    getDownloadsRoot: vi.fn().mockResolvedValue(''),
    setDownloadsRoot: vi.fn().mockResolvedValue('ok'),
    pickFolder: vi.fn().mockResolvedValue(''),
    getAutoStartEnabled: vi.fn().mockResolvedValue(true),
    setAutoStartEnabled: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('preferences-store', () => {
  afterEach(() => {
    resetPreferencesStore();
  });

  it('starts with safe defaults: seasonMode false, hasLoaded false, no errorMessage', () => {
    const state = getPreferencesStoreState();

    expect(state.seasonMode).toBe(false);
    expect(state.hasLoaded).toBe(false);
    expect(state.errorMessage).toBeUndefined();
  });

  it('refresh sets seasonMode and hasLoaded when the source resolves', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    await getPreferencesStoreState().refresh(source);

    expect(getPreferencesStoreState().seasonMode).toBe(true);
    expect(getPreferencesStoreState().hasLoaded).toBe(true);
    expect(getPreferencesStoreState().errorMessage).toBeUndefined();
  });

  it('refresh does not refetch if already loaded', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(false) });

    await getPreferencesStoreState().refresh(source);
    await getPreferencesStoreState().refresh(source);

    expect(source.getSeasonMode).toHaveBeenCalledTimes(1);
  });

  it('refresh sets errorMessage when the source rejects', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockRejectedValue(new Error('network error')) });

    await getPreferencesStoreState().refresh(source);

    expect(getPreferencesStoreState().hasLoaded).toBe(true);
    expect(getPreferencesStoreState().errorMessage).toBe('network error');
  });

  it('resetPreferencesStore clears all state back to defaults', async () => {
    const source = createSource({ getSeasonMode: vi.fn().mockResolvedValue(true) });

    await getPreferencesStoreState().refresh(source);
    resetPreferencesStore();

    expect(getPreferencesStoreState().seasonMode).toBe(false);
    expect(getPreferencesStoreState().hasLoaded).toBe(false);
    expect(getPreferencesStoreState().errorMessage).toBeUndefined();
  });
});
