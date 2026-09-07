import { Alert, Chip, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react';
import { useNavigate } from 'react-router';
import todayAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { ANIME_CREATE_ROUTE } from '../../../../shared/navigation/app-layout.constants';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CREATE_ANIME_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { EpisodeScheduleCard } from './EpisodeScheduleCard';
import { EPISODE_LENS_OPTIONS, EPISODE_LENS_TOGGLE_LABEL, EPISODE_TODAY_DOT_CLASS, EPISODE_TODAY_MARKER_LABEL, EPISODES_LOADING_MESSAGE } from './episode-schedule-panel.constants';
import { dayBadge, episodeDayLabel, toEpisodeViewLens } from './episode-schedule-panel.helpers';
import type { EpisodeSchedulePanelProps } from './episode-schedule-panel.types';
import { useEpisodeSchedulePanel } from './use-episode-schedule-panel';

/**
 * Renders the operational schedule for updating anime episode progress.
 */
export function EpisodeSchedulePanel(props: Readonly<EpisodeSchedulePanelProps>) {
  const { adjustWatchedEpisodes, copyAnimeFolder, copyAnimePage, dayCounts, emptyStateCopy, errorMessage, filterOptions, isLoadingSchedule, lens, openAnimeFolder, openAnimePage, rows, selectDay, selectLens, selectedDay, setAnimeState, todayDay } = useEpisodeSchedulePanel(props);
  const navigate = useNavigate();

  if (errorMessage !== '') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>Episode schedule unavailable</Alert.Title>
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Typography type="h2" className="text-3xl font-semibold tracking-tight text-foreground">
            {episodeDayLabel(selectedDay)}
          </Typography>
          <ToggleButtonGroup aria-label={EPISODE_LENS_TOGGLE_LABEL} disallowEmptySelection selectedKeys={[lens]} selectionMode="single" size="sm" onSelectionChange={(keys) => selectLens(toEpisodeViewLens(String(Array.from(keys)[0] ?? lens)))}>
            {EPISODE_LENS_OPTIONS.map((option) => (
              <ToggleButton id={option.id} key={option.id}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
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

      {isLoadingSchedule ? <Typography type="body-sm" color="muted">{EPISODES_LOADING_MESSAGE}</Typography> : null}

      {!isLoadingSchedule && rows.length === 0 ? (
        <AirisEmptyState
          action={{ label: AIRIS_CREATE_ANIME_LABEL, onPress: () => void navigate(ANIME_CREATE_ROUTE) }}
          description={emptyStateCopy.description}
          imageSrc={todayAirisArtwork}
          title={emptyStateCopy.title}
        />
      ) : null}

      <div className="grid gap-3">
        {rows.map((row) => (
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
        ))}
      </div>
    </section>
  );
}
