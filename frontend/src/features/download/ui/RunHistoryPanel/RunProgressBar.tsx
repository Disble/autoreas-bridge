import { ResponsiveBar } from '@nivo/bar';
import type { RunProgressBarProps } from './run-history-panel.types';

/**
 * Renders a stacked horizontal bar chart showing the proportion of episodes
 * that are downloaded (success), downloading (primary), or failed (danger).
 * Hidden entirely when episodesFound is zero.
 */
export function RunProgressBar({
  episodesFound,
  episodesDownloaded,
  episodesDownloading,
  episodesFailed,
}: Readonly<RunProgressBarProps>) {
  if (episodesFound <= 0) {
    return null;
  }

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
          colors={['#17C964', '#0385F7', '#DB3B3E']}
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
        {episodesDownloaded > 0 && <span className="text-success">■ {episodesDownloaded} done</span>}
        {episodesDownloading > 0 && <span className="text-primary">■ {episodesDownloading} down</span>}
        {episodesFailed > 0 && <span className="text-danger">■ {episodesFailed} fail</span>}
      </span>
    </div>
  );
}
