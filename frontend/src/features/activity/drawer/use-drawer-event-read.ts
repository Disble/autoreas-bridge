import { useCallback, useEffect, useState } from 'react';
import type { ActivityRunStep } from '../activity-source/activity-incident.types';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityRead, ActivityReadState, ActivityTaggedRead } from '../ui/ActivityRunStory/activity-run-story.types';
import { startActivityRead, toActivityCurrentRead, toActivityReadKey } from '../ui/ActivityRunStory/activity-time.helpers';
import { readDrawerEvent } from './drawer-reads.helpers';

/**
 * Owns the read of one runtime event with its metadata (`GetActivityEvent`),
 * the same contract as `useActivityRead` over the feed port: one read per id
 * and per "Try again", loading until its own answer arrives, and an answer for
 * an id no longer read dropped. Without an id nothing is read.
 *
 * @param source The feed port.
 * @param eventId The event row id; undefined reads nothing.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useDrawerEventRead(source: ActivityFeedSource, eventId: number | undefined): ActivityReadState<ActivityRunStep, undefined> {
  // 1. Refs

  // 2. State
  const [attempt, setAttempt] = useState(0);
  const [tagged, setTagged] = useState<ActivityTaggedRead<ActivityRunStep> | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const read: ActivityRead<ActivityRunStep> | undefined = eventId === undefined ? undefined : toActivityCurrentRead(tagged, toActivityReadKey(eventId, attempt));

  // 6. Callbacks (useCallback calling pure helpers)
  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  // 7. Effects
  useEffect(() => {
    if (eventId === undefined) {
      return undefined;
    }
    return startActivityRead(readDrawerEvent(source, eventId), toActivityReadKey(eventId, attempt), setTagged);
  }, [attempt, eventId, source]);

  return { read, retry };
}
