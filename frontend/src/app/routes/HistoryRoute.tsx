import { HistoryList } from '../../features/history/ui/HistoryList/HistoryList';

/**
 * History section: a top-level watch-activity log over the synchronized
 * anime inventory, separate from Catalog. Drill-down to a single anime
 * reuses the shared AnimeDetail via `/catalog/detail/:id`.
 */
export function HistoryRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">History</h1>
        <p className="text-sm text-muted">Track progress and repetition history for the synchronized inventory</p>
      </header>
      <div className="min-w-0">
        <HistoryList />
      </div>
    </div>
  );
}
