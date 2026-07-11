import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('preferences-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it('degrades to safe defaults when the runtime is unavailable', async () => {
    const { createPreferencesSource } = await import('../preferences-source');
    const source = createPreferencesSource();

    const seasonModePromise = source.getSeasonMode();
    const downloadsRootPromise = source.getDownloadsRoot();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(seasonModePromise).resolves.toBe(false);
    await expect(downloadsRootPromise).resolves.toBe('');
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/preferences-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const helperPath = join(sourceRoot, 'preferences-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/preferences-source.ts'))).toBe(false);
    expect(sourceText).toContain("from './preferences-source.types'");
    expect(sourceText).toContain("from './preferences-source.helpers'");
    expect(sourceText).not.toMatch(/export interface\s+PreferencesSource\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(sourceText).not.toMatch(/export const\s+/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
