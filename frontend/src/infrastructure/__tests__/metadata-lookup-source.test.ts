import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('metadata-lookup-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
  });

  it('degrades to a failed outcome, never a silent empty search or a hang, when the runtime never attaches', async () => {
    const { createMetadataLookupSource } = await import('../metadata-lookup-source/metadata-lookup-source.helpers');
    const source = createMetadataLookupSource();

    const searchPromise = source.SearchMyAnimeList('Bleach');
    const detailPromise = source.GetMyAnimeListDetail(41467);

    await vi.advanceTimersByTimeAsync(5000);

    const searchResult = await searchPromise;
    const detailResult = await detailPromise;

    expect(searchResult).toEqual({ outcome: 'error', message: 'The MyAnimeList lookup runtime is unavailable.', candidates: [] });
    expect(detailResult).toEqual({ outcome: 'error', message: 'The MyAnimeList lookup runtime is unavailable.' });
    // Explicit distinction (design D4): the degraded path is a failure, never
    // the legitimate zero-candidate outcome a real empty search reports.
    expect(searchResult.outcome).not.toBe('no_op');
  });

  it('preserves live Wails search and detail results once the runtime attaches', async () => {
    const searchMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'ok',
      candidates: [{ malId: 41467, name: 'Bleach: Sennen Kessen-hen' }],
    });
    const detailMock = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', title: 'Bleach: Sennen Kessen-hen' });
    window.go = {
      desktop: {
        App: {
          SearchMyAnimeList: searchMock,
          GetMyAnimeListDetail: detailMock,
        },
      },
    } as never;

    const { createMetadataLookupSource } = await import('../metadata-lookup-source/metadata-lookup-source.helpers');
    const source = createMetadataLookupSource();

    await expect(source.SearchMyAnimeList('Bleach')).resolves.toEqual({
      outcome: 'applied',
      message: 'ok',
      candidates: [{ malId: 41467, name: 'Bleach: Sennen Kessen-hen' }],
    });
    await expect(source.GetMyAnimeListDetail(41467)).resolves.toEqual({ outcome: 'applied', message: 'ok', title: 'Bleach: Sennen Kessen-hen' });
    expect(searchMock).toHaveBeenCalledWith('Bleach');
    expect(detailMock).toHaveBeenCalledWith(41467);
  });

  it('returns the same singleton instance on repeated calls', async () => {
    const { createMetadataLookupSource } = await import('../metadata-lookup-source/metadata-lookup-source.helpers');

    expect(createMetadataLookupSource()).toBe(createMetadataLookupSource());
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/metadata-lookup-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(sourceRoot, 'metadata-lookup-source.types.ts');
    const constantsPath = join(sourceRoot, 'metadata-lookup-source.constants.ts');
    const helperPath = join(sourceRoot, 'metadata-lookup-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(constantsPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/metadata-lookup-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
