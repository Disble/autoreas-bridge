import { Alert, Button } from '@heroui/react';
import { ActivityIncidentListResolved } from './ActivityIncidentListResolved';
import { ActivityIncidentListSkeleton } from './ActivityIncidentListSkeleton';
import { ACTIVITY_INCIDENT_LIST_ERROR_TITLE, ACTIVITY_INCIDENT_LIST_LOADING_LABEL } from './activity-incidents.constants';
import type { ActivityIncidentListPaneProps } from './activity-incidents.types';

/**
 * The list card's content: loading, failure and the resolved list are exclusive.
 */
export function ActivityIncidentListPane({ status, onRetry, ...resolved }: ActivityIncidentListPaneProps) {
  return (
    <>
      {status === 'loading' ? (
        <div aria-labelledby="activity-incident-list-loading-label" aria-live="polite" role="status">
          <span className="sr-only" id="activity-incident-list-loading-label">
            {ACTIVITY_INCIDENT_LIST_LOADING_LABEL}
          </span>
          <ActivityIncidentListSkeleton />
        </div>
      ) : null}
      {status === 'failed' ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{ACTIVITY_INCIDENT_LIST_ERROR_TITLE}</Alert.Title>
            <Button className="mt-2 self-start" onPress={onRetry} size="sm" variant="secondary">
              Try again
            </Button>
          </Alert.Content>
        </Alert>
      ) : null}
      {status === 'ready' ? <ActivityIncidentListResolved {...resolved} /> : null}
    </>
  );
}
