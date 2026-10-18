import { Alert, Button } from '@heroui/react';
import { ActivityRunStoryContent } from './ActivityRunStoryContent';
import { ActivityRunStorySkeleton } from './ActivityRunStorySkeleton';
import { ACTIVITY_RUN_STORY_ERROR_TITLE, ACTIVITY_RUN_STORY_LOADING_LABEL } from './activity-run-story.constants';
import type { ActivityRunStoryProps } from './activity-run-story.types';
import { useActivityRunStory } from './use-activity-run-story';

/**
 * "Inside the bridge": the story of one run, read by its correlation id.
 * Loading, failure and the resolved story are exclusive.
 */
export function ActivityRunStory({ correlationId }: ActivityRunStoryProps) {
  const { read, model, selectedStepId, metadata, isRawOpen, selectStep, toggleRaw, retry, copyReference } = useActivityRunStory(correlationId);

  if (read.status === 'loading') {
    return (
      <div aria-labelledby="activity-run-story-loading-label" aria-live="polite" role="status">
        <span className="sr-only" id="activity-run-story-loading-label">
          {ACTIVITY_RUN_STORY_LOADING_LABEL}
        </span>
        <ActivityRunStorySkeleton />
      </div>
    );
  }

  if (model === undefined) {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{ACTIVITY_RUN_STORY_ERROR_TITLE}</Alert.Title>
          <Button className="mt-2 self-start" onPress={retry} size="sm" variant="secondary">
            Try again
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <ActivityRunStoryContent
      isRawOpen={isRawOpen}
      metadata={metadata}
      model={model}
      onCopy={copyReference}
      onSelectStep={selectStep}
      onToggleRaw={toggleRaw}
      selectedStepId={selectedStepId}
    />
  );
}
