import { Alert, Button } from '@heroui/react';
import type { ScheduleMissedScheduleSectionProps } from './schedule-panel.types';

/**
 * Renders the startup-only missed selected-day notice (with its Run now/Ignore
 * actions) and any feedback left over from resolving it. Either half renders
 * independently, since the action message can outlive the notice it was raised
 * for.
 */
export function ScheduleMissedScheduleSection({
  notice,
  isResolvingMissedAction,
  actionMessage,
  onRunNow,
  onIgnore,
}: Readonly<ScheduleMissedScheduleSectionProps>) {
  return (
    <>
      {notice !== undefined && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Missed selected day</Alert.Title>
            <Alert.Description>
              The app started after the scheduled boundary for {notice.localDate}. Due time: {notice.dueLabel}.
              {notice.attemptStatus !== undefined ? ` Last Run now result: ${notice.attemptStatus}.` : ''}
            </Alert.Description>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                isDisabled={isResolvingMissedAction}
                variant="primary"
                onPress={() => {
                  onRunNow(notice.localDate);
                }}
              >
                Run now
              </Button>
              <Button
                isDisabled={isResolvingMissedAction}
                variant="secondary"
                onPress={() => {
                  onIgnore(notice.localDate);
                }}
              >
                Ignore
              </Button>
            </div>
          </Alert.Content>
        </Alert>
      )}

      {actionMessage !== undefined && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Missed schedule action needs attention</Alert.Title>
            <Alert.Description>{actionMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}
