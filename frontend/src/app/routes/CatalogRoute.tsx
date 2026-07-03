import { CatalogLensSwitch } from '../../features/catalog/ui/CatalogLensSwitch/CatalogLensSwitch';
import { CatalogPanel } from '../../features/catalog/ui/CatalogPanel/CatalogPanel';

/**
 * Catalog lens: the raw synchronized inventory. Renders the segmented
 * Catalog/History control (a lens switch, not a distinct page identity --
 * both lenses keep the "Catalog" page title).
 */
export function CatalogRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Catalog</h1>
        <p className="text-sm text-muted">Browse the synchronized anime inventory</p>
      </header>
      <CatalogLensSwitch />
      <div className="min-w-0">
        <CatalogPanel />
      </div>
    </div>
  );
}
