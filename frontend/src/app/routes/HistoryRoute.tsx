import { Typography } from '@heroui/react';
import { HistoryTimeline } from '../../features/history/ui/HistoryTimeline/HistoryTimeline';

/**
 * History section: a top-level, day-grouped watch-history timeline over the
 * synchronized anime inventory, separate from Catalog. Drill-down to a
 * single anime reuses the shared AnimeDetail via `/catalog/detail/:id`.
 */
export function HistoryRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">History</Typography>
        <Typography color="muted" type="body-sm">Every episode you have watched, grouped by day</Typography>
      </header>
      <div className="min-w-0">
        <HistoryTimeline />
      </div>
    </div>
  );
}
