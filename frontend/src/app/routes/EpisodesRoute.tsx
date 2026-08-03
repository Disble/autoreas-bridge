import { TodaySeasonBanner } from '../../features/season/ui/TodaySeasonBanner/TodaySeasonBanner';
import { EpisodeSchedulePanel } from '../../features/episodes/ui/EpisodeSchedulePanel/EpisodeSchedulePanel';
import { episodeDayLabel, getDefaultEpisodeDay } from '../../features/episodes/ui/EpisodeSchedulePanel/episode-schedule-panel.helpers';

/**
 * EpisodesRoute (nav label "Today") presents the schedule workspace used to
 * update today's anime progress from the main routed shell.
 */
export function EpisodesRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Today</h1>
        <p className="text-sm text-muted">{episodeDayLabel(getDefaultEpisodeDay())} · Update today&apos;s anime progress without opening Legacy.</p>
      </header>
      <TodaySeasonBanner />
      <div className="min-w-0">
        <EpisodeSchedulePanel />
      </div>
    </div>
  );
}
