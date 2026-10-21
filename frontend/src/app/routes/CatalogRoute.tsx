import { CatalogPanel } from '../../features/catalog/ui/CatalogPanel/CatalogPanel';

/**
 * Catalog section: the anime the bridge stores, browsed as covers or rows.
 * History is a separate top-level section (see `HistoryRoute`).
 */
export function CatalogRoute() {
  return <CatalogPanel />;
}
