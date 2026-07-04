import { Alert, Button, Card, Chip, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { CHAPTER_DAY_OPTIONS, CHAPTER_STATE_OPTIONS, CHAPTERS_EMPTY_MESSAGE } from './chapter-schedule-panel.constants';
import type { ChapterSchedulePanelProps } from './chapter-schedule-panel.types';
import { useChapterSchedulePanel } from './use-chapter-schedule-panel';

/**
 * Renders the operational schedule for updating anime chapter progress.
 */
export function ChapterSchedulePanel(props: Readonly<ChapterSchedulePanelProps>) {
  const { adjustWatchedChapters, errorMessage, rows, selectDay, selectedDay, setAnimeState } = useChapterSchedulePanel(props);

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
    <section className="flex flex-col gap-4">
      <ToggleButtonGroup disallowEmptySelection selectedKeys={[selectedDay]} selectionMode="single" onSelectionChange={(keys) => selectDay(String(Array.from(keys)[0] ?? selectedDay))}>
        {CHAPTER_DAY_OPTIONS.map((day) => (
          <ToggleButton id={day} key={day}>
            {day}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {rows.length === 0 ? <p className="text-sm text-muted">{CHAPTERS_EMPTY_MESSAGE}</p> : null}

      <div className="grid gap-3">
        {rows.map((row) => (
          <Card key={row.id}>
            <Card.Content className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold text-foreground">{row.name}</h2>
                  <Chip size="sm" color={row.isProgressBlocked ? 'warning' : 'success'} variant="soft">
                    {row.stateLabel}
                  </Chip>
                  {row.hasPage ? (
                    <Chip size="sm" color="accent" variant="tertiary">
                      Page
                    </Chip>
                  ) : null}
                  {row.hasFolder ? (
                    <Chip size="sm" color="default" variant="tertiary">
                      Folder
                    </Chip>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-muted">
                  <span>{row.watchedLabel}</span>
                  <span>{row.totalLabel}</span>
                  <span>{row.remainingLabel}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex flex-wrap gap-2">
                  <Button aria-label={`Subtract one chapter for ${row.name}`} isDisabled={row.isProgressBlocked} size="sm" variant="tertiary" onPress={() => void adjustWatchedChapters(row.id, -1, row.modifiedAt)}>
                    -1
                  </Button>
                  <Button aria-label={`Subtract half chapter for ${row.name}`} isDisabled={row.isProgressBlocked} size="sm" variant="tertiary" onPress={() => void adjustWatchedChapters(row.id, -0.5, row.modifiedAt)}>
                    -0.5
                  </Button>
                  <Button aria-label={`Add half chapter for ${row.name}`} isDisabled={row.isProgressBlocked} size="sm" variant="secondary" onPress={() => void adjustWatchedChapters(row.id, 0.5, row.modifiedAt)}>
                    +0.5
                  </Button>
                  <Button aria-label={`Add one chapter for ${row.name}`} isDisabled={row.isProgressBlocked} size="sm" variant="primary" onPress={() => void adjustWatchedChapters(row.id, 1, row.modifiedAt)}>
                    +1
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CHAPTER_STATE_OPTIONS.map((state) => (
                    <Button key={state.value} size="sm" variant={row.stateLabel === state.label ? 'secondary' : 'tertiary'} onPress={() => void setAnimeState(row.id, state.value, row.modifiedAt)}>
                      {state.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
    </section>
  );
}
