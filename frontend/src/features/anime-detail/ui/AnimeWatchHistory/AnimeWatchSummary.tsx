import { Fragment } from 'react';
import {
  ANIME_WATCH_SUMMARY_ENDED_LABEL,
  ANIME_WATCH_SUMMARY_EXPLANATION,
  ANIME_WATCH_SUMMARY_LAST_WATCHED_LABEL,
  ANIME_WATCH_SUMMARY_PREMIERE_LABEL,
  ANIME_WATCH_SUMMARY_STARTED_LABEL,
  ANIME_WATCH_SUMMARY_TESTID,
} from './anime-watch-history.constants';
import type { AnimeWatchSummaryProps } from './anime-watch-history.types';

/**
 * Dashed summary of one pre-log watch: a sentence saying why the episode list
 * is missing, then the four record dates (Started, Premiere, Last watched,
 * Ended) read straight from the repetition entry in two label-value pairs per
 * row, with no episode rows because the log postdates the watch. Pure
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
    <div
      className="flex flex-col gap-2.5 rounded-xl border border-dashed border-white/15 px-3.5 py-3"
      data-testid={`${ANIME_WATCH_SUMMARY_TESTID}-${watchNumber}`}
    >
      <p className="text-xs text-muted">{ANIME_WATCH_SUMMARY_EXPLANATION}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] justify-start gap-x-7 gap-y-1 text-xs sm:grid-cols-[repeat(4,auto)]">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="text-foreground">{value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}
