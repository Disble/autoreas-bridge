import { Alert, Chip, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react';
import { EpisodeScheduleCard } from './EpisodeScheduleCard';
import { EPISODE_LENS_OPTIONS, EPISODE_LENS_TOGGLE_LABEL, EPISODES_EMPTY_MESSAGE } from './episode-schedule-panel.constants';
import { dayBadge, episodeDayLabel, toEpisodeViewLens } from './episode-schedule-panel.helpers';
import type { EpisodeSchedulePanelProps } from './episode-schedule-panel.types';
import { useEpisodeSchedulePanel } from './use-episode-schedule-panel';

/**
 * Renders the operational schedule for updating anime episode progress.
 */
export function EpisodeSchedulePanel(props: Readonly<EpisodeSchedulePanelProps>) {
  const { adjustWatchedEpisodes, copyAnimeFolder, copyAnimePage, dayCounts, errorMessage, filterOptions, lens, openAnimeFolder, openAnimePage, rows, selectDay, selectLens, selectedDay, setAnimeState } = useEpisodeSchedulePanel(props);

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
            return (
              <ToggleButton id={day} key={day}>
                {episodeDayLabel(day)}
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

      {rows.length === 0 ? <Typography type="body-sm" color="muted">{EPISODES_EMPTY_MESSAGE}</Typography> : null}

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
