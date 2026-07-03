import { CatalogLensSwitch } from '../../features/catalog/ui/CatalogLensSwitch/CatalogLensSwitch';
import { HistoryList } from '../../features/history/ui/HistoryList/HistoryList';

/**
 * History lens: the progress/repetition workflow view over the same anime
 * set as Catalog. Thin composition route -- shares the same segmented
 * Catalog/History control and "Catalog" page title as CatalogRoute (History
 * is a lens, not a separate page identity); drill-down to a single anime
 * reuses the shared AnimeDetail via `/catalog/detail/:id`.
 */
export function HistoryRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Catalog</h1>
        <p className="text-sm text-muted">Track progress and repetition history for the synchronized inventory</p>
      </header>
      <CatalogLensSwitch />
      <div className="min-w-0">
        <HistoryList />
      </div>
    </div>
  );
}
