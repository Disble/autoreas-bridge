import { HistoryTimeline } from '../../features/history/ui/HistoryTimeline/HistoryTimeline';
import { PageHeader } from '../../shared/ui/PageHeader/PageHeader';

/**
 * History section: a top-level, day-grouped watch-history timeline over the
 * synchronized anime inventory, separate from Catalog. Drill-down to a
 * single anime reuses the shared AnimeDetail via `/catalog/detail/:id`.
 */
export function HistoryRoute() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="History" />
      <div className="min-w-0">
        <HistoryTimeline />
      </div>
    </div>
  );
}
