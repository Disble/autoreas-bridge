import { Typography } from '@heroui/react';
import { ACTIVITY_RUN_STEP_ROW_CLASS, ACTIVITY_TONE_DOT_CLASS, ACTIVITY_TONE_TEXT_CLASS } from './activity-run-story.constants';
import type { ActivityRunStoryContentProps } from './activity-run-story.types';

/**
 * A resolved run story as a vertical timeline: per step its time, a dot in
 * its tone, the step and a sub-line, in recorded order.
 */
export function ActivityRunStoryContent({ model }: ActivityRunStoryContentProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ol aria-label="Steps" className="flex min-w-0 flex-col">
        {model.steps.map((step) => (
          <li
            className={`relative ${ACTIVITY_RUN_STEP_ROW_CLASS} before:absolute before:top-4 before:-bottom-0.5 before:left-[110px] before:w-0.5 before:bg-separator before:content-[''] last:before:hidden`}
            key={step.id}
          >
            <span className="w-24 shrink-0 text-[13px] text-muted tabular-nums">{step.time}</span>
            <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-full ${ACTIVITY_TONE_DOT_CLASS[step.tone]}`} data-step-tone={step.tone} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`min-w-0 text-sm [overflow-wrap:anywhere] ${ACTIVITY_TONE_TEXT_CLASS[step.tone]}`}>{step.title}</span>
              <small className="min-w-0 text-[13px] text-muted [overflow-wrap:anywhere]">{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
      {model.truncatedNote === '' ? null : (
        <Typography color="muted" type="body-sm">
          {model.truncatedNote}
        </Typography>
      )}
    </div>
  );
}
