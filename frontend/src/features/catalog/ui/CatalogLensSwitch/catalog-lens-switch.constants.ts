import type { CatalogLens } from './catalog-lens-switch.types';

/** Accessible label for the segmented Catalog/History control. */
export const CATALOG_LENS_SWITCH_LABEL = 'Catalog lens';

/** Display labels for each lens option. */
export const CATALOG_LENS_SWITCH_LABELS: Readonly<Record<CatalogLens, string>> = {
  catalog: 'Catalog',
  history: 'History',
};

/** Route path for the Catalog lens (raw inventory). */
export const CATALOG_LENS_CATALOG_PATH = '/catalog';

/** Route path for the History lens (progress/repetition workflow). */
export const CATALOG_LENS_HISTORY_PATH = '/catalog/history';
