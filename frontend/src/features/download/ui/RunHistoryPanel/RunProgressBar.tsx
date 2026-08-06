import { ResponsiveBar } from '@nivo/bar';
import { pendingEpisodesLabel } from './run-history-panel.helpers';
import type { RunProgressBarProps } from './run-history-panel.types';

/**
 * Renders a stacked horizontal bar chart showing the proportion of episodes
 * that are downloaded (success), pending, or failed (danger).
 * Hidden entirely when episodesFound is zero.
 *
 * The pending segment changes meaning with `isRunning`: active blue while the
 * run is open and genuinely downloading, muted grey once it has terminated and
 * the same episodes are simply ones nobody ever attempted. Painting a finished
 * run's untouched episodes in progress-blue is what made a jd_offline run look
 * like it had eight downloads in flight.
 */
export function RunProgressBar({
  episodesFound,
  episodesDownloaded,
  episodesDownloading,
  episodesFailed,
  isRunning,
}: Readonly<RunProgressBarProps>) {
  if (episodesFound <= 0) {
    return null;
  }

  const pendingColor = isRunning ? '#0385F7' : '#71717A';

  return (
    <div className="flex flex-col gap-1">
      <div className="h-3 w-full">
        <ResponsiveBar
          data={[
            {
              id: 'episodes',
              downloaded: episodesDownloaded,
              downloading: episodesDownloading,
              failed: episodesFailed,
            },
          ]}
          keys={['downloaded', 'downloading', 'failed']}
          indexBy="id"
          layout="horizontal"
          groupMode="stacked"
          colors={['#17C964', pendingColor, '#DB3B3E']}
          enableLabel={false}
          enableGridX={false}
          enableGridY={false}
          axisTop={null}
          axisRight={null}
          axisBottom={null}
          axisLeft={null}
          padding={0}
          innerPadding={0}
          borderRadius={2}
          isInteractive={false}
          animate
          motionConfig="wobbly"
        />
      </div>
      <span className="flex gap-3 text-xs text-muted">
        {episodesDownloaded > 0 && <span className="text-success">■ {episodesDownloaded} downloaded</span>}
        {episodesDownloading > 0 && (
          <span className={isRunning ? 'text-primary' : 'text-default-500'}>
            ■ {episodesDownloading} {pendingEpisodesLabel(isRunning).toLowerCase()}
          </span>
        )}
        {episodesFailed > 0 && <span className="text-danger">■ {episodesFailed} failed</span>}
      </span>
    </div>
  );
}
