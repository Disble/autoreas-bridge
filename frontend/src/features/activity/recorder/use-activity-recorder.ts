import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { isNearListBottom, nextRenderLimit } from '../../../shared/helpers/progressive-list.helpers';
import { createHistorySource } from '../history-source/history-source.helpers';
import type { HistorySource } from '../history-source/history-source.types';
import { ACTIVITY_RECORDER_CAP, ACTIVITY_RECORDER_PAGE_LIMIT } from './activity-recorder.constants';
import {
  appendOlderRecorderRows,
  canLoadOlderRecorderRows,
  toRecorderLineModel,
  toRecorderRow,
  upsertRecorderRow,
} from './activity-recorder.helpers';
import type { ActivityRecorderRequestStatus, ActivityRecorderRow } from './activity-recorder.types';

/**
 * Owns the 2-hour recorder: the first page, live rows from `activity.recorder`
 * (upserted by id, newest first, capped at 500), and a rendered window that
 * grows near the bottom, reading an older page through the cursor once every
 * held row is rendered. Live rows that arrive before the first page resolves
 * are kept and the page is appended after them.
 *
 * @param source The History port; the shared Wails source when omitted.
 * @returns The request status, the rendered lines, the scroll trigger and the retry.
 */
export function useActivityRecorder(source: HistorySource = createHistorySource()) {
  // 1. Refs
  const sequenceRef = useRef(0);
  const cursorRef = useRef('');
  const isLoadingMoreRef = useRef(false);

  // 2. State
  const [status, setStatus] = useState<ActivityRecorderRequestStatus>('loading');
  const [rows, setRows] = useState<readonly ActivityRecorderRow[]>([]);
  const [renderLimit, setRenderLimit] = useState(ACTIVITY_RECORDER_PAGE_LIMIT);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const lines = useMemo(() => rows.slice(0, renderLimit).map(toRecorderLineModel), [rows, renderLimit]);
  const isAtCap = rows.length >= ACTIVITY_RECORDER_CAP;

  // 6. Callbacks (useCallback calling pure helpers)
  const loadFirstPage = useCallback(() => {
    setStatus('loading');
    void source
      .listRecorder('', ACTIVITY_RECORDER_PAGE_LIMIT)
      .then((page) => {
        cursorRef.current = page.nextCursor;
        setRows((shown) => appendOlderRecorderRows(shown, page.entries, ACTIVITY_RECORDER_CAP));
        setStatus('ready');
      })
      .catch(() => setStatus('failed'));
  }, [source]);

  const loadOlderPage = useCallback(() => {
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    void source
      .listRecorder(cursorRef.current, ACTIVITY_RECORDER_PAGE_LIMIT)
      .then((page) => {
        cursorRef.current = page.nextCursor;
        setRows((shown) => appendOlderRecorderRows(shown, page.entries, ACTIVITY_RECORDER_CAP));
        setRenderLimit((limit) => limit + ACTIVITY_RECORDER_PAGE_LIMIT);
      })
      .catch(() => undefined)
      .finally(() => {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  }, [source]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      if (!isNearListBottom(element.scrollTop, element.clientHeight, element.scrollHeight)) {
        return;
      }
      if (renderLimit < rows.length) {
        setRenderLimit(nextRenderLimit(renderLimit, ACTIVITY_RECORDER_PAGE_LIMIT, rows.length));
        return;
      }
      if (canLoadOlderRecorderRows(cursorRef.current, rows.length, isLoadingMoreRef.current, ACTIVITY_RECORDER_CAP)) {
        loadOlderPage();
      }
    },
    [loadOlderPage, renderLimit, rows.length],
  );

  // 7. Effects
  useEffect(() => {
    const unsubscribe = source.subscribeRecorder((entry) => {
      const row = toRecorderRow(entry, sequenceRef.current);
      sequenceRef.current += 1;
      setRows((shown) => upsertRecorderRow(shown, row, ACTIVITY_RECORDER_CAP));
    });
    loadFirstPage();
    return unsubscribe;
  }, [loadFirstPage, source]);

  return { status, lines, rowCount: rows.length, isAtCap, isLoadingMore, onScroll, retry: loadFirstPage };
}
