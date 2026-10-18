import { Alert, Button } from '@heroui/react';
import activityAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityNowContent } from './ActivityNowContent';
import { ActivityNowSkeleton } from './ActivityNowSkeleton';
import {
  ACTIVITY_NOW_EMPTY_ACTION_LABEL,
  ACTIVITY_NOW_EMPTY_DESCRIPTION,
  ACTIVITY_NOW_EMPTY_TITLE,
  ACTIVITY_NOW_ERROR_DESCRIPTION,
  ACTIVITY_NOW_ERROR_TITLE,
  ACTIVITY_NOW_LOADING_LABEL,
} from './activity-now.constants';
import type { ActivityNowProps } from './activity-now.types';
import { useActivityNow } from './use-activity-now';

/**
 * The Now tab, "is everything fine?". Loading, failure, first run and the
 * resolved content are exclusive: exactly one of them renders.
 */
export function ActivityNow({ onOpenIncident }: ActivityNowProps) {
  const { state, model, retry, openPairing } = useActivityNow();

  if (state.status === 'loading') {
    return (
      <div aria-labelledby="activity-now-loading-label" aria-live="polite" role="status">
        <span className="sr-only" id="activity-now-loading-label">
          {ACTIVITY_NOW_LOADING_LABEL}
        </span>
        <ActivityNowSkeleton />
      </div>
    );
  }

  if (model === undefined) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{ACTIVITY_NOW_ERROR_TITLE}</Alert.Title>
          <Alert.Description>{ACTIVITY_NOW_ERROR_DESCRIPTION}</Alert.Description>
          <Button className="mt-2 self-start" onPress={retry} size="sm" variant="secondary">
            Try again
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  if (model.isEmpty) {
    return (
      <AirisEmptyState
        action={{ label: ACTIVITY_NOW_EMPTY_ACTION_LABEL, onPress: openPairing }}
        description={ACTIVITY_NOW_EMPTY_DESCRIPTION}
        imageSrc={activityAirisArtwork}
        kind="first-run"
        title={ACTIVITY_NOW_EMPTY_TITLE}
      />
    );
  }

  return <ActivityNowContent model={model} onOpenIncident={onOpenIncident} />;
}
