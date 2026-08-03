import { Typography } from '@heroui/react';
import { CatalogPanel } from '../../features/catalog/ui/CatalogPanel/CatalogPanel';

/**
 * Catalog section: the raw synchronized anime inventory only. History is a
 * separate top-level section (see `HistoryRoute`).
 */
export function CatalogRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">Catalog</Typography>
        <Typography color="muted" type="body-sm">Browse the synchronized anime inventory</Typography>
      </header>
      <div className="min-w-0">
        <CatalogPanel />
      </div>
    </div>
  );
}
