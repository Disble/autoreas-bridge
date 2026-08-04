import { Alert, Button, Card, Chip, Input, Label, Skeleton, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { useSchedulePanel } from './use-schedule-panel';
import { SEASON_MODE_BANNER_DESCRIPTION, SEASON_MODE_BANNER_TITLE, WEEKDAY_OPTIONS } from './schedule-panel.constants';
import { weekdayValuesToMask } from './schedule-panel.helpers';
import type { SchedulePanelProps } from './schedule-panel.types';

/**
 * SchedulePanel renders the in-process scheduler's enabled toggle, daily
 * run time, weekday restriction, and live next/last-run status. All Wails
 * calls and persistence logic live in the colocated `useSchedulePanel` hook;
 * this component is presentation-only.
 */
export function SchedulePanel({ className }: Readonly<SchedulePanelProps>) {
  const {
    status,
    viewModel,
    dailyTimeDraft,
    isSaving,
    saveErrorMessage,
    readinessErrorMessage,
    isResolvingMissedAction,
    missedActionMessage,
    setEnabled,
    setDailyTimeDraft,
    commitDailyTime,
    setWeekdays,
    runMissedScheduleNow,
    ignoreMissedSchedule,
    refreshReadiness,
  } = useSchedulePanel();

  if (status === 'loading') {
    return (
      <section aria-label="Loading schedule configuration" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
      </section>
    );
  }

  if (status === 'error') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Schedule unavailable</Alert.Title>
          <Alert.Description>Failed to load schedule configuration.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <Card className={className}>
      <Card.Header>
        <Card.Title>Download schedule</Card.Title>
        <Card.Description>Automatically check for new episodes on the selected days.</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {saveErrorMessage !== undefined && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Schedule save failed</Alert.Title>
              <Alert.Description>{saveErrorMessage}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {viewModel.missedNotice !== undefined && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Missed selected day</Alert.Title>
              <Alert.Description>
                The app started after the scheduled boundary for {viewModel.missedNotice.localDate}. Due time: {viewModel.missedNotice.dueLabel}.
                {viewModel.missedNotice.attemptStatus !== undefined ? ` Last Run now result: ${viewModel.missedNotice.attemptStatus}.` : ''}
              </Alert.Description>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  isDisabled={isResolvingMissedAction}
                  variant="primary"
                  onPress={() => {
                    runMissedScheduleNow(viewModel.missedNotice!.localDate).catch(() => undefined);
                  }}
                >
                  Run now
                </Button>
                <Button
                  isDisabled={isResolvingMissedAction}
                  variant="secondary"
                  onPress={() => {
                    ignoreMissedSchedule(viewModel.missedNotice!.localDate).catch(() => undefined);
                  }}
                >
                  Ignore
                </Button>
              </div>
            </Alert.Content>
          </Alert>
        )}

        {missedActionMessage !== undefined && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Missed schedule action needs attention</Alert.Title>
              <Alert.Description>{missedActionMessage}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {readinessErrorMessage !== undefined && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Download readiness unavailable</Alert.Title>
              <Alert.Description>{readinessErrorMessage}</Alert.Description>
              <Button
                className="mt-3"
                variant="secondary"
                onPress={() => {
                  refreshReadiness().catch(() => undefined);
                }}
              >
                Retry
              </Button>
            </Alert.Content>
          </Alert>
        )}

        {viewModel.isScheduledToday && viewModel.readiness !== undefined && viewModel.readiness.scheduledBlocked > 0 && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Scheduled anime need attention</Alert.Title>
              <Alert.Description>
                {viewModel.readiness.scheduledReady} of {viewModel.readiness.scheduledTotal} scheduled anime are ready for download checks.{' '}
                {viewModel.readiness.scheduledBlocked} will be skipped.
              </Alert.Description>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {viewModel.readiness.blockedAnime.map((anime) => (
                  <li key={anime.name}>
                    {anime.name}: {anime.reasonLabels.join(' ')}
                  </li>
                ))}
              </ul>
            </Alert.Content>
          </Alert>
        )}

        {viewModel.seasonModeActive && (
          <Alert status="default">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{SEASON_MODE_BANNER_TITLE}</Alert.Title>
              <Alert.Description>{SEASON_MODE_BANNER_DESCRIPTION}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <Switch
          isDisabled={isSaving}
          isSelected={viewModel.enabled}
          onChange={(isSelected) => {
            setEnabled(isSelected).catch(() => undefined);
          }}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Enable scheduled downloads
          </Switch.Content>
        </Switch>

        <TextField>
          <Label>Daily run time</Label>
          <Input
            disabled={isSaving || !viewModel.enabled}
            fullWidth
            type="time"
            value={dailyTimeDraft}
            onBlur={() => {
              commitDailyTime().catch(() => undefined);
            }}
            onChange={(event) => setDailyTimeDraft(event.target.value)}
          />
        </TextField>

        <div className="flex flex-col gap-2">
          <Label>Run on these days</Label>
          <ToggleButtonGroup
            aria-label="Days of the week the schedule runs on"
            isDetached
            isDisabled={isSaving || !viewModel.enabled}
            onSelectionChange={(keys) => {
              setWeekdays(weekdayValuesToMask([...keys].map(String))).catch(() => undefined);
            }}
            selectedKeys={viewModel.selectedWeekdayValues}
            selectionMode="multiple"
            size="sm"
          >
            {WEEKDAY_OPTIONS.map((option) => (
              <ToggleButton id={option.value} key={option.value}>
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>

        {viewModel.willNeverRun && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>No days selected</Alert.Title>
              <Alert.Description>The schedule is enabled but won&apos;t run until you pick at least one day.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <div className="flex flex-col gap-1 text-sm text-muted">
          <div className="flex items-center gap-2">
            <span>Last run:</span>
            <span className="text-foreground">{viewModel.lastRunLabel}</span>
            <Chip color={viewModel.lastRunStatus === 'ok' ? 'success' : 'default'} size="sm" variant="soft">
              <Chip.Label>{viewModel.lastRunStatus || '—'}</Chip.Label>
            </Chip>
          </div>
          <div className="flex items-center gap-2">
            <span>Next run:</span>
            <span className="text-foreground">{viewModel.nextRunLabel}</span>
          </div>
          {viewModel.running && (
            <Chip className="w-fit" color="default" size="sm" variant="soft">
              <Chip.Label>Running now</Chip.Label>
            </Chip>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
