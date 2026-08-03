import { Typography } from '@heroui/react';
import { HistoryTable } from '../../features/history/ui/HistoryTable/HistoryTable';

/**
 * History section: a top-level watch-activity log over the synchronized
 * anime inventory, separate from Catalog. Drill-down to a single anime
 * reuses the shared AnimeDetail via `/catalog/detail/:id`.
 */
export function HistoryRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">History</Typography>
        <Typography color="muted" type="body-sm">Track progress and repetition history for the synchronized inventory</Typography>
      </header>
      <div className="min-w-0">
        <HistoryTable />
      </div>
    </div>
  );
}
