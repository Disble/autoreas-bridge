import { Alert, Button, Skeleton, Typography } from '@heroui/react';
import { ActivityRequestBody } from './ActivityRequestBody';
import { ACTIVITY_REQUEST_ERROR_TITLE, ACTIVITY_REQUEST_LOADING_LABEL } from './activity-incidents.constants';
import type { ActivityRequestPaneProps } from './activity-incidents.types';

/**
 * The picked request, read by its id: one summary line, then the response
 * and request bodies. Loading, failure, gone and the request are exclusive.
 */
export function ActivityRequestPane({ request, model, isBodyOpen, onToggleBody, onRetry }: ActivityRequestPaneProps) {
  if (request.status === 'loading') {
    return (
      <div aria-labelledby="activity-request-loading-label" aria-live="polite" className="flex flex-col gap-2" role="status">
        <span className="sr-only" id="activity-request-loading-label">
          {ACTIVITY_REQUEST_LOADING_LABEL}
        </span>
        <Skeleton className="h-4 w-2/3 rounded" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    );
  }

  if (request.status === 'failed') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{ACTIVITY_REQUEST_ERROR_TITLE}</Alert.Title>
          <Button className="mt-2 self-start" onPress={onRetry} size="sm" variant="secondary">
            Try again
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  if (model === undefined) {
    return (
      <Typography color="muted" type="body-sm">
        This request is no longer kept.
      </Typography>
    );
  }

  return (
    <section aria-label="Selected request" className="flex min-w-0 flex-col gap-3">
      <Typography className="break-all font-mono" type="body-sm">
        {model.summary}
      </Typography>
      {model.bodies.map((body) => (
        <ActivityRequestBody body={body} isOpen={isBodyOpen(body.label)} key={body.label} onToggle={() => onToggleBody(body.label)} />
      ))}
    </section>
  );
}
