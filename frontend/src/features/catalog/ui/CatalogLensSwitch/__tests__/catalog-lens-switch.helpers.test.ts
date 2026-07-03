import { describe, expect, it } from 'vitest';
import { deriveCatalogLensFromPath, resolveCatalogLensPath } from '../catalog-lens-switch.helpers';

describe('deriveCatalogLensFromPath', () => {
  it('derives the history lens from the history path', () => {
    expect(deriveCatalogLensFromPath('/catalog/history')).toBe('history');
  });

  it('derives the catalog lens from the catalog path', () => {
    expect(deriveCatalogLensFromPath('/catalog')).toBe('catalog');
  });

  it('defaults to the catalog lens for any other path (e.g. the detail route)', () => {
    expect(deriveCatalogLensFromPath('/catalog/detail/anime-1')).toBe('catalog');
  });
});

describe('resolveCatalogLensPath', () => {
  it('resolves the history lens to /catalog/history', () => {
    expect(resolveCatalogLensPath('history')).toBe('/catalog/history');
  });

  it('resolves the catalog lens to /catalog', () => {
    expect(resolveCatalogLensPath('catalog')).toBe('/catalog');
  });
});
