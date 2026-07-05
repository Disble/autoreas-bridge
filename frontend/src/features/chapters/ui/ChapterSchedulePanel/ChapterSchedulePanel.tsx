import { Alert, Chip, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react';
import { ChapterScheduleCard } from './ChapterScheduleCard';
import { CHAPTERS_EMPTY_MESSAGE } from './chapter-schedule-panel.constants';
import { dayBadge } from './chapter-schedule-panel.helpers';
import type { ChapterSchedulePanelProps } from './chapter-schedule-panel.types';
import { useChapterSchedulePanel } from './use-chapter-schedule-panel';

/**
 * Renders the operational schedule for updating anime chapter progress.
 */
export function ChapterSchedulePanel(props: Readonly<ChapterSchedulePanelProps>) {
  const { adjustWatchedChapters, copyAnimeFolder, copyAnimePage, dayCounts, errorMessage, filterOptions, openAnimeFolder, openAnimePage, rows, selectDay, selectedDay, setAnimeState } = useChapterSchedulePanel(props);

  if (errorMessage !== '') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>Chapter schedule unavailable</Alert.Title>
          <Alert.Description>{errorMessage}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Typography type="h1" className="text-3xl font-semibold tracking-tight text-foreground">
          {selectedDay}
        </Typography>
        <ToggleButtonGroup disallowEmptySelection selectedKeys={[selectedDay]} selectionMode="single" size="sm" onSelectionChange={(keys) => selectDay(String(Array.from(keys)[0] ?? selectedDay))}>
          {filterOptions.map((day) => {
            const badgeCount = dayBadge(day, dayCounts);
            return (
              <ToggleButton id={day} key={day}>
                {day}
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

      {rows.length === 0 ? <Typography type="body-sm" color="muted">{CHAPTERS_EMPTY_MESSAGE}</Typography> : null}

      <div className="grid gap-3">
        {rows.map((row) => (
          <ChapterScheduleCard
            key={row.id}
            row={row}
            adjustWatchedChapters={adjustWatchedChapters}
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
