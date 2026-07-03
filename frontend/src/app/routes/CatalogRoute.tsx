import { CatalogPanel } from '../../features/catalog/ui/CatalogPanel/CatalogPanel';

export function CatalogRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Catalog</h1>
        <p className="text-sm text-muted">Browse the synchronized anime inventory</p>
      </header>
      <div className="min-w-0">
        <CatalogPanel />
      </div>
    </div>
  );
}
