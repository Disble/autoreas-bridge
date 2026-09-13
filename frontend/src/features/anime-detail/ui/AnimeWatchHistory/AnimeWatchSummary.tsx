import {
  ANIME_WATCH_SUMMARY_ENDED_LABEL,
  ANIME_WATCH_SUMMARY_LAST_WATCHED_LABEL,
  ANIME_WATCH_SUMMARY_PREMIERE_LABEL,
  ANIME_WATCH_SUMMARY_STARTED_LABEL,
  ANIME_WATCH_SUMMARY_TESTID,
} from './anime-watch-history.constants';
import type { AnimeWatchSummaryProps } from './anime-watch-history.types';

/**
 * Dashed summary of one pre-log watch: the four record dates (Started,
 * Premiere, Last watched, Ended) read straight from the repetition entry,
 * with no episode rows because the log postdates the watch. Pure
 * presentation over the derived summary; the parent branches to it whenever
 * the view model carries one.
 */
export function AnimeWatchSummary({ watchNumber, summary }: AnimeWatchSummaryProps) {
  const rows: ReadonlyArray<readonly [string, string]> = [
    [ANIME_WATCH_SUMMARY_STARTED_LABEL, summary.started],
    [ANIME_WATCH_SUMMARY_PREMIERE_LABEL, summary.premiere],
    [ANIME_WATCH_SUMMARY_LAST_WATCHED_LABEL, summary.lastWatched],
    [ANIME_WATCH_SUMMARY_ENDED_LABEL, summary.ended],
  ];

  return (
    <dl
      className="flex flex-col divide-y divide-dashed divide-divider px-3 py-1 text-sm"
      data-testid={`${ANIME_WATCH_SUMMARY_TESTID}-${watchNumber}`}
    >
      {rows.map(([label, value]) => (
        <div className="flex items-center justify-between gap-3 py-1" key={label}>
          <dt className="text-default-500">{label}</dt>
          <dd className="text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
