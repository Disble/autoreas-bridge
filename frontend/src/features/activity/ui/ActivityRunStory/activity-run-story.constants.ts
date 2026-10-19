import type { ActivityChipModel, ActivityTone } from './activity-run-story.types';

/** Milliseconds per second. */
export const ACTIVITY_SECOND_MS = 1_000;

/** Milliseconds per minute. */
export const ACTIVITY_RUN_MINUTE_MS = 60_000;

/** Local `Oct 17, 17:31` (the owner's local time, 24-hour clock). */
export const ACTIVITY_DAY_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** The result of a run per its worst level; any other level reads as finished. */
export const ACTIVITY_RUN_OUTCOMES: Readonly<Record<string, ActivityChipModel>> = {
  error: { label: 'Failed', color: 'danger' },
  warn: { label: 'Recovered', color: 'warning' },
};

/** The result of a run whose worst level is neither an error nor a warning. */
export const ACTIVITY_RUN_FINISHED: ActivityChipModel = { label: 'Finished', color: 'success' };

/** Event-type endings that mark a successful step. */
export const ACTIVITY_SUCCESS_EVENT_SUFFIXES: readonly string[] = ['succeeded', 'success', 'completed', 'finished', 'done', 'saved'];

/** Screen-reader label of the run story loading region. */
export const ACTIVITY_RUN_STORY_LOADING_LABEL = 'Loading the run story';

/** Failure alert title of the run story. */
export const ACTIVITY_RUN_STORY_ERROR_TITLE = 'The run story could not be read';

/** Toast after "Copy for AI" copied a reference. */
export const ACTIVITY_COPY_SUCCESS_MESSAGE = 'Reference copied. Paste it into your AI chat.';

/** Toast after "Copy for AI" could not write the clipboard. */
export const ACTIVITY_COPY_FAILURE_MESSAGE = 'Could not copy the reference.';

/** Skeleton step rows, a typical short run. */
export const ACTIVITY_RUN_STORY_SKELETON_STEPS = 4;

/** Shared row geometry of a step, used by the steps and their skeleton. */
export const ACTIVITY_RUN_STEP_ROW_CLASS = 'flex min-h-12 min-w-0 items-start gap-3';

/** Dot fill per tone: color is spent only on what needs attention. */
export const ACTIVITY_TONE_DOT_CLASS: Readonly<Record<ActivityTone, string>> = {
  danger: 'bg-danger',
  warning: 'bg-warning',
  success: 'bg-success',
  default: 'bg-muted',
};

/** Text color per tone, for an emphasized title. */
export const ACTIVITY_TONE_TEXT_CLASS: Readonly<Record<ActivityTone, string>> = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
  default: 'text-foreground',
};
