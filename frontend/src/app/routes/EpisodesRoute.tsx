import { TodaySeasonBanner } from '../../features/season/ui/TodaySeasonBanner/TodaySeasonBanner';
import { EpisodeSchedulePanel } from '../../features/episodes/ui/EpisodeSchedulePanel/EpisodeSchedulePanel';

/**
 * EpisodesRoute (nav label "Today") presents the schedule workspace used to
 * update today's anime progress from the main routed shell. The panel owns the
 * Today title row, because its view-lens toggle sits on it; the route only
 * slots the season banner between that row and the day tabs.
 */
export function EpisodesRoute() {
  return (
    <div className="min-w-0">
      <EpisodeSchedulePanel banner={<TodaySeasonBanner />} />
    </div>
  );
}
