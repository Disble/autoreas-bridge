import { useMemo } from 'react';
import { BRIDGE_ACTIVITY_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { ActivitySource } from '../../../../shared/contracts/activity.types';
import { readActivityRunStory, toActivityRunStoryModel } from './activity-run-story.helpers';
import { toActivityReadValue } from './activity-time.helpers';
import { useActivityRead } from './use-activity-read';

/**
 * Owns one run story: a single `GetActivityRunStory` read per correlation id
 * (and per "Try again"). An answer for a run no longer shown is dropped.
 *
 * @param correlationId The run to read.
 * @param source The Activity port; the shared bridge source when omitted.
 * @returns The read, its worded timeline, and the retry.
 */
export function useActivityRunStory(correlationId: string, source: ActivitySource = BRIDGE_ACTIVITY_SOURCE) {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { read, retry } = useActivityRead(source, correlationId, readActivityRunStory, 'run-story');

  // 5. Derived State (useMemo)
  const story = toActivityReadValue(read);
  const model = useMemo(() => (story === undefined ? undefined : toActivityRunStoryModel(story)), [story]);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return { read, model, retry };
}
