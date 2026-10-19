import { Alert, Button } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityIncidentDetailContent } from './ActivityIncidentDetailContent';
import { ActivityIncidentDetailSkeleton } from './ActivityIncidentDetailSkeleton';
import { ActivityRequestPane } from './ActivityRequestPane';
import { ACTIVITY_INCIDENT_DETAIL_ERROR_TITLE, ACTIVITY_INCIDENT_DETAIL_LOADING_LABEL } from './activity-incidents.constants';
import type { ActivityIncidentDetailProps } from './activity-incidents.types';
import { useActivityIncidentDetail } from './use-activity-incident-detail';

/**
 * One incident, read by its id. Loading, failure, an occurrence that aged out
 * and the resolved detail are exclusive.
 */
export function ActivityIncidentDetail({ incidentId }: ActivityIncidentDetailProps) {
  const { read, model, selectedRequestId, request, requestModel, pickRequest, toggleBody, isBodyOpen, retry, retryRequest, copyReference } =
    useActivityIncidentDetail(incidentId);

  if (read.status === 'loading') {
    return (
      <div aria-labelledby="activity-incident-loading-label" aria-live="polite" role="status">
        <span className="sr-only" id="activity-incident-loading-label">
          {ACTIVITY_INCIDENT_DETAIL_LOADING_LABEL}
        </span>
        <ActivityIncidentDetailSkeleton />
      </div>
    );
  }

  if (read.status === 'failed') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{ACTIVITY_INCIDENT_DETAIL_ERROR_TITLE}</Alert.Title>
          <Button className="mt-2 self-start" onPress={retry} size="sm" variant="secondary">
            Try again
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  if (model === undefined) {
    return <AirisEmptyState description="It aged out of the kept history." kind="caught-up" size="section" title="This incident is no longer kept" />;
  }

  return (
    <ActivityIncidentDetailContent
      model={model}
      onCopy={copyReference}
      onSelectRequest={pickRequest}
      requestPane={
        request === undefined ? null : <ActivityRequestPane isBodyOpen={isBodyOpen} model={requestModel} onRetry={retryRequest} onToggleBody={toggleBody} request={request} />
      }
      selectedRequestId={selectedRequestId}
    />
  );
}
