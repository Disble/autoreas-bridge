import { useCallback, useEffect, useState } from 'react';
import type { ActivityFeedSource } from '../feed-source/feed-source.types';
import type { ActivityRead, ActivityReadState, ActivityTaggedRead } from '../ui/ActivityRunStory/activity-run-story.types';
import { startActivityRead, toActivityCurrentRead, toActivityReadKey } from '../ui/ActivityRunStory/activity-time.helpers';
import type { DrawerFeedReader } from './drawer.types';

/**
 * Owns one by-id read over the feed port (an event by `GetActivityEvent`, a
 * change's context by `GetActivityChangeContext`), the same contract as
 * `useActivityRead`: one read per id and per "Try again", loading until its
 * own answer arrives, and an answer for an id no longer read dropped. Without
 * an id nothing is read.
 *
 * @param source The feed port.
 * @param id The row key; undefined reads nothing.
 * @param reader Reads one id; a stable, module-level function.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useDrawerFeedRead<K extends string | number, T>(source: ActivityFeedSource, id: K | undefined, reader: DrawerFeedReader<K, T>): ActivityReadState<T, undefined> {
  // 1. Refs

  // 2. State
  const [attempt, setAttempt] = useState(0);
  const [tagged, setTagged] = useState<ActivityTaggedRead<T> | undefined>();

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const read: ActivityRead<T> | undefined = id === undefined ? undefined : toActivityCurrentRead(tagged, toActivityReadKey(id, attempt));

  // 6. Callbacks (useCallback calling pure helpers)
  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
  }, []);

  // 7. Effects
  useEffect(() => {
    if (id === undefined) {
      return undefined;
    }
    return startActivityRead(reader(source, id), toActivityReadKey(id, attempt), setTagged);
  }, [attempt, id, reader, source]);

  return { read, retry };
}
