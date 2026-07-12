import { Alert, Card, Chip, Input, Label, Skeleton, Switch, TextField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
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
    setEnabled,
    setDailyTimeDraft,
    commitDailyTime,
    setWeekdays,
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
      <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
        Failed to load schedule configuration.
      </p>
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
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
            {saveErrorMessage}
          </p>
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
