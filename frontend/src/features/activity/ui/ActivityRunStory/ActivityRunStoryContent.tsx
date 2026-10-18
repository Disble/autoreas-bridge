import { Button, Chip, Typography } from '@heroui/react';
import { ActivityCopyForAiButton } from './ActivityCopyForAiButton';
import { ActivityRunMetadata } from './ActivityRunMetadata';
import { ACTIVITY_RUN_STEP_ROW_CLASS, ACTIVITY_TONE_DOT_CLASS, ACTIVITY_TONE_TEXT_CLASS } from './activity-run-story.constants';
import type { ActivityRunStoryContentProps } from './activity-run-story.types';

/**
 * A resolved run story: what ran and how it ended, every step in order with
 * warnings and successes emphasized, and the selected step's recorded detail.
 */
export function ActivityRunStoryContent({ model, selectedStepId, metadata, isRawOpen, onSelectStep, onToggleRaw, onCopy }: ActivityRunStoryContentProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Typography className="min-w-0 [overflow-wrap:anywhere]" type="h3">
            {model.title}
          </Typography>
          <div className="flex flex-wrap items-center gap-2">
            <Chip color={model.outcome.color} size="sm" variant="soft">
              {model.outcome.label}
            </Chip>
            {model.domain === '' ? null : (
              <Chip size="sm" variant="soft">
                {model.domain}
              </Chip>
            )}
            <Typography color="muted" type="body-sm">
              {model.span}
            </Typography>
          </div>
          {model.trigger === '' ? null : (
            <Typography className="min-w-0 [overflow-wrap:anywhere]" color="muted" type="body-sm">
              Started by: {model.trigger}
            </Typography>
          )}
        </div>
        <ActivityCopyForAiButton label="this run" onCopy={onCopy} />
      </div>
      <ol aria-label="Steps" className="flex min-w-0 flex-col">
        {model.steps.map((step) => (
          <li key={step.id}>
            <Button
              aria-current={step.id === selectedStepId ? 'step' : undefined}
              className={`${ACTIVITY_RUN_STEP_ROW_CLASS} h-auto w-full justify-start py-2 text-left`}
              onPress={() => onSelectStep(step.id)}
              variant={step.id === selectedStepId ? 'secondary' : 'ghost'}
            >
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${ACTIVITY_TONE_DOT_CLASS[step.tone]}`} data-step-tone={step.tone} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`min-w-0 truncate text-sm ${ACTIVITY_TONE_TEXT_CLASS[step.tone]}`}>{step.title}</span>
                <span className="min-w-0 truncate text-xs text-muted">
                  {step.time} · {step.detail}
                </span>
              </span>
            </Button>
          </li>
        ))}
      </ol>
      {model.truncatedNote === '' ? null : (
        <Typography color="muted" type="body-sm">
          {model.truncatedNote}
        </Typography>
      )}
      {selectedStepId === undefined ? null : <ActivityRunMetadata isRawOpen={isRawOpen} metadata={metadata} onToggleRaw={onToggleRaw} />}
    </div>
  );
}
