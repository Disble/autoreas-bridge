import { useEffect, useRef } from 'react';
import type { HistorySource } from '../history-source/history-source.types';
import { ACTIVITY_LIVE_DEBOUNCE_MS } from './activity-feed.constants';

/**
 * Calls `onLive` once the recorder has been quiet for a moment after any
 * `activity.recorder` event, so a burst of phone requests reads the feed and
 * the counts once rather than once per request (S8).
 *
 * @param source The History port that carries the recorder subscription.
 * @param onLive What to do after live activity.
 */
export function useActivityLiveRefresh(source: HistorySource, onLive: () => void): void {
  // 1. Refs
  const onLiveRef = useRef(onLive);

  // 7. Effects
  useEffect(() => {
    onLiveRef.current = onLive;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = source.subscribeRecorder(() => {
      clearTimeout(timer);
      timer = setTimeout(() => onLiveRef.current(), ACTIVITY_LIVE_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [source]);
}
