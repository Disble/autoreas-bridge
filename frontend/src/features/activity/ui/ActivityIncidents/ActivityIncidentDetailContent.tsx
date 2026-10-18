import { Alert, Chip, Typography } from '@heroui/react';
import { ActivityCopyForAiButton } from '../ActivityRunStory/ActivityCopyForAiButton';
import { ActivityRunStory } from '../ActivityRunStory/ActivityRunStory';
import { ActivityIncidentLanes } from './ActivityIncidentLanes';
import { ActivityIncidentRequests } from './ActivityIncidentRequests';
import type { ActivityIncidentDetailContentProps } from './activity-incidents.types';

/**
 * A resolved incident: its header, the recorded cause, then either the run
 * story of an internal incident or the request window (lanes, the folded
 * request table and the picked request), and the occurrence footer.
 */
export function ActivityIncidentDetailContent({ model, selectedRequestId, onSelectRequest, onCopy, requestPane }: ActivityIncidentDetailContentProps) {
  return (
    <article aria-labelledby="activity-incident-title" className="flex min-w-0 flex-col gap-4">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Typography className="min-w-0 [overflow-wrap:anywhere]" id="activity-incident-title" type="h2">
            {model.title}
          </Typography>
          <div className="flex flex-wrap items-center gap-2">
            {model.chips.map((chip) => (
              <Chip color={chip.color} key={chip.label} size="sm" variant="soft">
                {chip.label}
              </Chip>
            ))}
            <Typography color="muted" type="body-sm">
              {model.span}
            </Typography>
          </div>
        </div>
        <ActivityCopyForAiButton label="this incident" onCopy={onCopy} />
      </header>
      {model.cause === undefined ? (
        <Typography color="muted" type="body-sm">
          No cause was recorded for this incident.
        </Typography>
      ) : (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content className="min-w-0">
            <Alert.Title>Cause</Alert.Title>
            <Alert.Description className="min-w-0 [overflow-wrap:anywhere]">
              {model.cause.code === '' ? null : <span className="font-mono">{model.cause.code} · </span>}
              {model.cause.message}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {model.runCorrelationId === undefined ? (
        <>
          <ActivityIncidentLanes lanes={model.lanes} />
          <section aria-labelledby="activity-incident-requests" className="flex min-w-0 flex-col gap-2">
            <Typography id="activity-incident-requests" type="h3">
              Requests in this window
            </Typography>
            <ActivityIncidentRequests onSelect={onSelectRequest} rows={model.requests} selectedRequestId={selectedRequestId} />
            {requestPane}
          </section>
        </>
      ) : (
        <ActivityRunStory correlationId={model.runCorrelationId} />
      )}
      <footer className="flex flex-col gap-0.5">
        <Typography color="muted" type="body-xs">
          {model.earlierLine}
        </Typography>
        <Typography color="muted" type="body-xs">
          {model.expiryLine}
        </Typography>
      </footer>
    </article>
  );
}
