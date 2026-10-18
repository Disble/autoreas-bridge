import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { createActivitySource } from '../../activity-source/activity-source.helpers';
import type { ActivitySource } from '../../activity-source/activity-source.types';
import {
  ACTIVITY_NOW_REFRESH_INTERVAL_MS,
  ACTIVITY_PAIRING_ROUTE,
} from './activity-now.constants';
import { toActivityNowModel } from './activity-now.helpers';
import type { ActivityNowState } from './activity-now.types';

/**
 * Owns the Now tab's read: the first load, a refresh every 15 seconds so the
 * Go-computed status sentence stays current, and a refresh on each live
 * recorder row. Never more than one read is in flight: a trigger arriving
 * during a read marks it stale, and a stale read is followed by exactly one
 * more. A refresh keeps the resolved view on screen; only the first load shows
 * the skeleton. A failed read shows the failure state until "Try again" or
 * the next successful refresh.
 *
 * @param source The Activity port; the shared Wails source when omitted.
 * @returns The request state, the worded model once resolved, the retry, and the first-run action.
 */
export function useActivityNow(source: ActivitySource = createActivitySource()) {
  // 1. Refs
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);
  const isStaleRef = useRef(false);
  const loadRef = useRef<() => void>(() => undefined);

  // 2. State
  const [state, setState] = useState<ActivityNowState>({ status: 'loading' });

  // 3. Context/3rd Party Hooks
  const navigate = useNavigate();

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const model = useMemo(() => (state.status === 'ready' ? toActivityNowModel(state.view, state.readAtMs) : undefined), [state]);

  // 6. Callbacks (useCallback calling pure helpers)
  const load = useCallback(() => {
    if (isLoadingRef.current) {
      isStaleRef.current = true;
      return;
    }
    isLoadingRef.current = true;
    void source
      .getNow()
      .then((view) => setState({ status: 'ready', view, readAtMs: Date.now() }))
      .catch(() => setState({ status: 'failed' }))
      .finally(() => {
        isLoadingRef.current = false;
        if (isStaleRef.current && isMountedRef.current) {
          isStaleRef.current = false;
          loadRef.current();
        }
      });
  }, [source]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    load();
  }, [load]);

  const openPairing = useCallback(() => {
    void navigate(ACTIVITY_PAIRING_ROUTE);
  }, [navigate]);

  // 7. Effects
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    isMountedRef.current = true;
    load();
    const intervalId = window.setInterval(load, ACTIVITY_NOW_REFRESH_INTERVAL_MS);
    const unsubscribe = source.subscribeRecorder(load);
    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
      unsubscribe();
    };
  }, [load, source]);

  return { state, model, retry, openPairing };
}
