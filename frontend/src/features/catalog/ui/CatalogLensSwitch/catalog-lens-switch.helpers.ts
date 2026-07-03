import { CATALOG_LENS_CATALOG_PATH, CATALOG_LENS_HISTORY_PATH } from './catalog-lens-switch.constants';
import type { CatalogLens } from './catalog-lens-switch.types';

/**
 * Derives the active lens from the current route pathname. Any path other
 * than the exact History path (including the shared detail route) resolves
 * to Catalog -- the switch is only ever mounted on `/catalog` and
 * `/catalog/history`, so this default is safe.
 */
export function deriveCatalogLensFromPath(pathname: string): CatalogLens {
  return pathname === CATALOG_LENS_HISTORY_PATH ? 'history' : 'catalog';
}

/** Resolves a lens to its route path. */
export function resolveCatalogLensPath(lens: CatalogLens): string {
  return lens === 'history' ? CATALOG_LENS_HISTORY_PATH : CATALOG_LENS_CATALOG_PATH;
}
