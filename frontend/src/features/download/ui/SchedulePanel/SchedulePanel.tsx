import { Alert, Card, Input, Label, Switch, TextField } from '@heroui/react';
import { LoadingBars } from '../../../../shared/ui/LoadingBars/LoadingBars';
import { ScheduleMissedScheduleSection } from './ScheduleMissedScheduleSection';
import { ScheduleReadinessSection } from './ScheduleReadinessSection';
import { ScheduleRunStatusFooter } from './ScheduleRunStatusFooter';
import { ScheduleSaveErrorAlert } from './ScheduleSaveErrorAlert';
import { ScheduleSeasonModeBanner } from './ScheduleSeasonModeBanner';
import { ScheduleWeekdayPicker } from './ScheduleWeekdayPicker';
import { useSchedulePanel } from './use-schedule-panel';
import type { SchedulePanelProps } from './schedule-panel.types';

/**
 * SchedulePanel renders the in-process scheduler's enabled toggle, daily
 * run time, weekday restriction, and live next/last-run status. All Wails
 * calls and persistence logic live in the colocated `useSchedulePanel` hook;
 * this component is presentation-only. Each disclosure (save errors, the
 * missed-schedule notice, readiness warnings, the season-mode banner, and the
 * weekday picker's own warning) is a colocated sibling component so this file
 * stays a flat composition.
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
    return <LoadingBars className={className} count={2} label="Loading schedule configuration" />;
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
        <ScheduleSaveErrorAlert message={saveErrorMessage} />

        <ScheduleMissedScheduleSection
          actionMessage={missedActionMessage}
          isResolvingMissedAction={isResolvingMissedAction}
          notice={viewModel.missedNotice}
          onIgnore={(localDate) => {
            ignoreMissedSchedule(localDate).catch(() => undefined);
          }}
          onRunNow={(localDate) => {
            runMissedScheduleNow(localDate).catch(() => undefined);
          }}
        />

        <ScheduleReadinessSection
          isScheduledToday={viewModel.isScheduledToday}
          onRetryReadiness={() => {
            refreshReadiness().catch(() => undefined);
          }}
          readiness={viewModel.readiness}
          readinessErrorMessage={readinessErrorMessage}
        />

        <ScheduleSeasonModeBanner isActive={viewModel.seasonModeActive} />

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

        <ScheduleWeekdayPicker
          isDisabled={isSaving || !viewModel.enabled}
          onWeekdaysChange={(mask) => {
            setWeekdays(mask).catch(() => undefined);
          }}
          selectedWeekdayValues={viewModel.selectedWeekdayValues}
          willNeverRun={viewModel.willNeverRun}
        />

        <ScheduleRunStatusFooter
          lastRunLabel={viewModel.lastRunLabel}
          lastRunStatus={viewModel.lastRunStatus}
          nextRunLabel={viewModel.nextRunLabel}
          running={viewModel.running}
        />
      </Card.Content>
    </Card>
  );
}
