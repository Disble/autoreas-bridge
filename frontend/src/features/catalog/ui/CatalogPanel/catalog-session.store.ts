import { createStore } from 'zustand/vanilla';
import { CATALOG_DEFAULT_CRITERIA, CATALOG_DEFAULT_SORT, CATALOG_DEFAULT_VIEW } from './catalog-panel.constants';
import type { CatalogSessionState } from './catalog-panel.types';

/** The state a fresh session opens the Catalog with. */
const CATALOG_SESSION_DEFAULTS: CatalogSessionState = {
  criteria: CATALOG_DEFAULT_CRITERIA,
  sort: CATALOG_DEFAULT_SORT,
  view: CATALOG_DEFAULT_VIEW,
};

/**
 * In-memory Catalog session. It outlives the panel, which unmounts while an
 * anime detail is open, and dies with the app: nothing is written to disk.
 */
export const catalogSessionStore = createStore<CatalogSessionState>()(() => CATALOG_SESSION_DEFAULTS);

/** Restores the session a fresh app start opens with, for tests. */
export function resetCatalogSession(): void {
  catalogSessionStore.setState(CATALOG_SESSION_DEFAULTS);
}
