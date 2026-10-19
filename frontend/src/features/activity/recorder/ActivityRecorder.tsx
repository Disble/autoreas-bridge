import { Alert, Button, Card, Chip, Typography } from '@heroui/react';
import { Icon } from '@iconify/react';
import backIcon from '@iconify-icons/solar/alt-arrow-left-linear';
import { AirisEmptyState } from '../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityRecorderList } from './ActivityRecorderList';
import { ActivityRecorderSkeleton } from './ActivityRecorderSkeleton';
import { ACTIVITY_RECORDER_LOADING_LABEL } from './activity-recorder.constants';
import type { ActivityRecorderProps } from './activity-recorder.types';
import { useActivityRecorder } from './use-activity-recorder';

/**
 * The 2-hour recorder: every request and bridge event, newest first, with
 * live rows arriving at the top. Loading, failure, empty and the list are
 * exclusive; the header with the back action always shows.
 */
export function ActivityRecorder({ onBack }: ActivityRecorderProps) {
  const { status, lines, isAtCap, isLoadingMore, onScroll, retry } = useActivityRecorder();

  return (
    <Card>
      <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button onPress={onBack} size="sm" variant="ghost">
            <Icon aria-hidden icon={backIcon} />
            Back
          </Button>
          <Typography type="h3">Last 2 hours</Typography>
        </div>
        <Chip color="success" size="sm" variant="soft">
          Recording
        </Chip>
      </Card.Header>
      <Card.Content>
        {status === 'loading' ? (
          <div aria-labelledby="activity-recorder-loading-label" aria-live="polite" role="status">
            <span className="sr-only" id="activity-recorder-loading-label">
              {ACTIVITY_RECORDER_LOADING_LABEL}
            </span>
            <ActivityRecorderSkeleton />
          </div>
        ) : null}
        {status === 'failed' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>The recorder could not be read</Alert.Title>
              <Alert.Description>The rest of the app keeps working.</Alert.Description>
              <Button className="mt-2 self-start" onPress={retry} size="sm" variant="secondary">
                Try again
              </Button>
            </Alert.Content>
          </Alert>
        ) : null}
        {status === 'ready' && lines.length === 0 ? (
          <AirisEmptyState description="Requests and bridge events show here as they happen." kind="caught-up" size="section" title="Nothing recorded in the last 2 hours" />
        ) : null}
        {status === 'ready' && lines.length > 0 ? <ActivityRecorderList isAtCap={isAtCap} isLoadingMore={isLoadingMore} lines={lines} onScroll={onScroll} /> : null}
      </Card.Content>
    </Card>
  );
}
