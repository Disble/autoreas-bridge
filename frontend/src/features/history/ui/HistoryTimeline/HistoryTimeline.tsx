import { Button } from '@heroui/react';
import { useNavigate } from 'react-router';
import { formatRowTime } from '../../../../shared/watch-history/watch-history.helpers';
import { HISTORY_TIMELINE_LABEL } from './history-timeline.constants';
import { useHistoryTimeline } from './use-history-timeline';

/**
 * Global watch-history timeline (Anime History spec, "Episode Timeline Is
 * Grouped By Day"): one row per watched episode, grouped under a day heading
 * that shows that day's count, newest day and newest row first. The whole
 * row is the keyboard-accessible drill-down affordance to that episode's
 * anime detail. Owns its data via `useHistoryTimeline`; the three exclusive
 * loading/empty/error states and scroll-driven paging land in a later slice
 * (design D5/D5a) -- this renders whatever the hook has resolved so far.
 */
export function HistoryTimeline() {
  const navigate = useNavigate();
  const { groups } = useHistoryTimeline();

  return (
    <div aria-label={HISTORY_TIMELINE_LABEL} className="flex max-h-[32rem] min-h-0 flex-col gap-4 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.dayKey}>
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            {group.heading} ({group.count})
          </h2>
          <ul className="flex flex-col gap-1">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <Button
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-divider/60 bg-content1/60 px-3 py-2 text-left text-sm"
                  variant="outline"
                  onPress={() => {
                    void navigate(`/catalog/detail/${entry.animeId}`);
                  }}
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{entry.animeName}</span>
                    <span className="text-xs text-muted">Episode {entry.episode}</span>
                  </span>
                  <span className="text-xs text-muted">{formatRowTime(entry.watchedAtMs)}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
