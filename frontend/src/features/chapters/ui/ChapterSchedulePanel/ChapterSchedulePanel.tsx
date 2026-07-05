import { Alert, Button, Card, Chip, Modal, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@heroui/react';
import type { MouseEvent } from 'react';
import { CHAPTER_STATE_OPTIONS, CHAPTERS_EMPTY_MESSAGE } from './chapter-schedule-panel.constants';
import type { ChapterSchedulePanelProps } from './chapter-schedule-panel.types';
import { useChapterSchedulePanel } from './use-chapter-schedule-panel';

/**
 * Renders the operational schedule for updating anime chapter progress.
 */
export function ChapterSchedulePanel(props: Readonly<ChapterSchedulePanelProps>) {
  const { adjustWatchedChapters, copyAnimeFolder, copyAnimePage, errorMessage, filterOptions, openAnimeFolder, openAnimePage, rows, selectDay, selectedDay, setAnimeState } = useChapterSchedulePanel(props);

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
          {filterOptions.map((day) => (
            <ToggleButton id={day} key={day}>
              {day}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      {rows.length === 0 ? <Typography type="body-sm" color="muted">{CHAPTERS_EMPTY_MESSAGE}</Typography> : null}

      <div className="grid gap-3">
        {rows.map((row) => (
          <Card key={row.id}>
            <Card.Content className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Typography type="h2" className="truncate text-base font-semibold text-foreground">
                    {row.name}
                  </Typography>
                  <Chip size="sm" color={row.isProgressBlocked ? 'warning' : 'success'} variant="soft">
                    {row.stateLabel}
                  </Chip>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <Tooltip delay={0}>
                    <span>{row.watchedLabel}</span>
                    <Tooltip.Content showArrow>
                      <Tooltip.Arrow />
                      {row.progressTitle}
                    </Tooltip.Content>
                  </Tooltip>
                  {row.hasPage ? (
                    <Button
                      aria-label={`Open page for ${row.name}. Secondary click copies page URL.`}
                      size="sm"
                      variant="tertiary"
                      onContextMenu={(event: MouseEvent) => {
                        event.preventDefault();
                        void copyAnimePage(row.id);
                      }}
                      onPress={() => void openAnimePage(row.id)}
                    >
                      Page
                    </Button>
                  ) : null}
                  {row.hasFolder ? (
                    <Button
                      aria-label={`Open folder for ${row.name}. Secondary click copies folder path.`}
                      size="sm"
                      variant="tertiary"
                      onContextMenu={(event: MouseEvent) => {
                        event.preventDefault();
                        void copyAnimeFolder(row.id);
                      }}
                      onPress={() => void openAnimeFolder(row.id)}
                    >
                      Folder
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Button
                  aria-label={`Subtract one chapter for ${row.name}. Secondary click subtracts half chapter.`}
                  isDisabled={row.isProgressBlocked}
                  size="sm"
                  variant="tertiary"
                  onContextMenu={(event: MouseEvent) => {
                    event.preventDefault();
                    void adjustWatchedChapters(row.id, -0.5, row.modifiedAt);
                  }}
                  onPress={() => void adjustWatchedChapters(row.id, -1, row.modifiedAt)}
                >
                  −
                </Button>
                <Button
                  aria-label={`Add one chapter for ${row.name}. Secondary click adds half chapter.`}
                  isDisabled={row.isProgressBlocked}
                  size="sm"
                  variant="primary"
                  onContextMenu={(event: MouseEvent) => {
                    event.preventDefault();
                    void adjustWatchedChapters(row.id, 0.5, row.modifiedAt);
                  }}
                  onPress={() => void adjustWatchedChapters(row.id, 1, row.modifiedAt)}
                >
                  +
                </Button>
                <Modal>
                  <Button aria-label={`Change status for ${row.name}. Current status: ${row.stateLabel}.`} size="sm" variant="secondary">
                    {row.stateLabel}
                  </Button>
                  <Modal.Backdrop variant="blur">
                    <Modal.Container>
                      <Modal.Dialog className="sm:max-w-[420px]">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                          <Modal.Heading>Change anime status</Modal.Heading>
                          <Typography type="body-sm" color="muted">
                            {row.name}
                          </Typography>
                        </Modal.Header>
                        <Modal.Body>
                          <div className="grid grid-cols-2 gap-2">
                            {CHAPTER_STATE_OPTIONS.map((state) => (
                              <Button key={state.value} aria-label={`Set ${row.name} as ${state.label}`} variant={row.stateLabel === state.label ? 'secondary' : 'tertiary'} onPress={() => void setAnimeState(row.id, state.value, row.modifiedAt)}>
                                {state.label}
                              </Button>
                            ))}
                          </div>
                        </Modal.Body>
                      </Modal.Dialog>
                    </Modal.Container>
                  </Modal.Backdrop>
                </Modal>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
    </section>
  );
}
