import { Alert, Button } from '@heroui/react';
import type { ScheduleReadinessSectionProps } from './schedule-panel.types';

/**
 * Renders the download-readiness disclosures above the schedule controls: a
 * retryable failure banner when the readiness query itself failed, and — once
 * it succeeds — a warning naming which scheduled anime will be skipped today.
 * Neither renders outside its own condition, so the section can disappear
 * entirely.
 */
export function ScheduleReadinessSection({
  readinessErrorMessage,
  onRetryReadiness,
  readiness,
  isScheduledToday,
}: Readonly<ScheduleReadinessSectionProps>) {
  return (
    <>
      {readinessErrorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Download readiness unavailable</Alert.Title>
            <Alert.Description>{readinessErrorMessage}</Alert.Description>
            <Button className="mt-3" variant="secondary" onPress={onRetryReadiness}>
              Retry
            </Button>
          </Alert.Content>
        </Alert>
      )}

      {isScheduledToday && readiness !== undefined && readiness.scheduledBlocked > 0 && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Scheduled anime need attention</Alert.Title>
            <Alert.Description>
              {readiness.scheduledReady} of {readiness.scheduledTotal} scheduled anime are ready for download checks.{' '}
              {readiness.scheduledBlocked} will be skipped.
            </Alert.Description>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {readiness.blockedAnime.map((anime) => (
                <li key={anime.name}>
                  {anime.name}: {anime.reasonLabels.join(' ')}
                </li>
              ))}
            </ul>
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}
