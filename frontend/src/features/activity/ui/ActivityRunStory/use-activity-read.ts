import { useCallback, useEffect, useState } from 'react';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import type { ActivityRead, ActivityReader, ActivityReadState, ActivityTaggedRead } from './activity-run-story.types';
import { startActivityRead, toActivityCurrentRead, toActivityReadKey } from './activity-time.helpers';

/**
 * Owns the read of an id that is always present.
 *
 * @param source The Activity port.
 * @param id What to read.
 * @param reader Reads one id; a stable, module-level function.
 * @returns The current read and "Try again".
 */
export function useActivityRead<K extends string | number, T>(source: ActivitySource, id: K, reader: ActivityReader<K, T>): ActivityReadState<T>;
/**
 * Owns the read of an id that may be absent.
 *
 * @param source The Activity port.
 * @param id What to read; undefined reads nothing.
 * @param reader Reads one id; a stable, module-level function.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useActivityRead<K extends string | number, T>(
  source: ActivitySource,
  id: K | undefined,
  reader: ActivityReader<K, T>,
): ActivityReadState<T, undefined>;
/**
 * Owns one by-id read: exactly one read per id and per "Try again", loading
 * until its own answer arrives. An answer for an id no longer read, or for an
 * older attempt, is dropped. Without an id nothing is read.
 *
 * @param source The Activity port.
 * @param id What to read; undefined reads nothing.
 * @param reader Reads one id; a stable, module-level function.
 * @returns The current read, undefined without an id, and "Try again".
 */
export function useActivityRead<K extends string | number, T>(
  source: ActivitySource,
  id: K | undefined,
  reader: ActivityReader<K, T>,
): ActivityReadState<T, undefined> {
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
