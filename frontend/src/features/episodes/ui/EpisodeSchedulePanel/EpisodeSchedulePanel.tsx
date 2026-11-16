import { Alert, Chip, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { useNavigate } from 'react-router';
import todayAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { PageHeader } from '../../../../shared/ui/PageHeader/PageHeader';
import { EpisodeScheduleCard } from './EpisodeScheduleCard';
import { EpisodeScheduleSkeleton } from './EpisodeScheduleSkeleton';
import { EPISODE_LENS_OPTIONS, EPISODE_SCHEDULE_PAGE_TITLE, EPISODE_SCHEDULE_UNAVAILABLE_TITLE, EPISODE_LENS_TOGGLE_LABEL, EPISODE_TODAY_DOT_CLASS, EPISODE_TODAY_MARKER_LABEL, EPISODES_LOADING_MESSAGE } from './episode-schedule-panel.constants';
import { dayBadge, episodeDayLabel, getEpisodeEmptyStateNavigation, toEpisodeViewLens } from './episode-schedule-panel.helpers';
import type { EpisodeSchedulePanelProps } from './episode-schedule-panel.types';
import { useEpisodeSchedulePanel } from './use-episode-schedule-panel';

/**
 * Renders the Today screen: the title row carrying the view-lens toggle, the
 * optional banner slot, the day tabs, then exactly one state of the schedule
 * (`scheduleView.kind`, ADR-032 §4): the skeleton while it loads (including
 * while the episodes module starts), the failure Alert, the empty state, or
 * the rows.
 */
export function EpisodeSchedulePanel(props: Readonly<EpisodeSchedulePanelProps>) {
  const { adjustWatchedEpisodes, copyAnimeFolder, copyAnimePage, dayCounts, emptyStateCopy, filterOptions, isScheduleRefreshing, lens, openAnimeFolder, openAnimePage, scheduleView, selectDay, selectLens, selectedDay, setAnimeState, todayDay } = useEpisodeSchedulePanel(props);
  const navigate = useNavigate();
  const emptyNavigation = getEpisodeEmptyStateNavigation(emptyStateCopy.action);

  if (scheduleView.kind === 'failure') {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title={EPISODE_SCHEDULE_PAGE_TITLE} />
        {props.banner}
        <Alert status="danger">
          <Alert.Content>
            <Alert.Title>{EPISODE_SCHEDULE_UNAVAILABLE_TITLE}</Alert.Title>
            <Alert.Description>{scheduleView.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        actions={
          <ToggleButtonGroup aria-label={EPISODE_LENS_TOGGLE_LABEL} disallowEmptySelection selectedKeys={[lens]} selectionMode="single" size="sm" onSelectionChange={(keys) => selectLens(toEpisodeViewLens(String(Array.from(keys)[0] ?? lens)))}>
            {EPISODE_LENS_OPTIONS.map((option) => (
              <ToggleButton id={option.id} key={option.id}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        }
        title={EPISODE_SCHEDULE_PAGE_TITLE}
      />
      {props.banner}
      <div className="flex flex-col">
        <ToggleButtonGroup disallowEmptySelection selectedKeys={[selectedDay]} selectionMode="single" size="sm" onSelectionChange={(keys) => selectDay(String(Array.from(keys)[0] ?? selectedDay))}>
          {filterOptions.map((day) => {
            const badgeCount = dayBadge(day, dayCounts);
            const isToday = day === todayDay;
            return (
              <ToggleButton id={day} key={day}>
                {isToday ? <span aria-hidden="true" className={EPISODE_TODAY_DOT_CLASS} /> : null}
                {episodeDayLabel(day)}
                {isToday ? <span className="sr-only">{EPISODE_TODAY_MARKER_LABEL}</span> : null}
                {badgeCount === undefined ? null : (
                  <Chip size="sm" variant="soft">
                    {badgeCount}
                  </Chip>
                )}
              </ToggleButton>
            );
          })}
        </ToggleButtonGroup>
      </div>

      {scheduleView.kind === 'loading' ? (
        <div aria-labelledby="episode-schedule-loading-label" aria-live="polite" className="grid gap-3" role="status">
          <span className="sr-only" id="episode-schedule-loading-label">{EPISODES_LOADING_MESSAGE}</span>
          <EpisodeScheduleSkeleton />
        </div>
      ) : null}

      {scheduleView.kind === 'empty' ? (
        <AirisEmptyState
          action={{ label: emptyNavigation.label, onPress: () => void navigate(emptyNavigation.route) }}
          description={emptyStateCopy.description}
          imageSrc={todayAirisArtwork}
          kind={emptyStateCopy.kind}
          title={emptyStateCopy.title}
        />
      ) : null}

      {/*
        Only the ready state renders rows: a new day's request shows the
        skeleton (the view maps the previous day's placeholder rows to
        loading), so stale cards never sit under the placeholders.
      */}
      <div aria-busy={isScheduleRefreshing} className="grid gap-3">
        {scheduleView.kind === 'ready' ? scheduleView.data.map((row) => (
          <EpisodeScheduleCard
            key={row.id}
            row={row}
            adjustWatchedEpisodes={adjustWatchedEpisodes}
            copyAnimeFolder={copyAnimeFolder}
            copyAnimePage={copyAnimePage}
            openAnimeFolder={openAnimeFolder}
            openAnimePage={openAnimePage}
            setAnimeState={setAnimeState}
          />
        )) : null}
      </div>
    </section>
  );
}
