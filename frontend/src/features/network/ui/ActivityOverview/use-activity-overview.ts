import { useEffect, useMemo, useState } from 'react';
import { createCaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import type { CaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.types';
import { createRuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.helpers';
import type { RuntimeEventSource } from '../../../../infrastructure/runtime-event-source/runtime-event-source.types';
import type { CaptureSummary } from '../../../../shared/contracts/capture.types';
import type { RuntimeEventSummary } from '../../../../shared/contracts/runtime-event.types';
import { resolveEventStatusMessage } from '../NetworkPanel/network-panel.helpers';
import {
  OVERVIEW_EVENTS_EMPTY_MESSAGE,
  OVERVIEW_REQUESTS_EMPTY_MESSAGE,
} from './activity-overview.constants';
import {
  resolveOverviewEmptyMessage,
  resolveRequestSummaryStatusMessage,
  sumRequestCounts,
  toEventSampleRows,
  toEventSummarySections,
  toRequestHealthRows,
} from './activity-overview.helpers';

/**
 * Starting request aggregation, held until the first read resolves. Zeroed AND
 * healthy on purpose: the hook suppresses every disclosure while `isLoading` is
 * true, so this value is never read as a measurement.
 */
const PENDING_REQUEST_SUMMARY: CaptureSummary = { groups: [], degraded: false };

/**
 * Starting event aggregation, held until the first read resolves. `available`
 * is true here for the same reason: a starting `false` is indistinguishable
 * from an absent store, and announcing that before any evidence arrives would
 * flash a disclosure the surface cannot support.
 */
const PENDING_EVENT_SUMMARY: RuntimeEventSummary = {
  byDomain: [],
  byLevel: [],
  byEventType: [],
  samples: [],
  available: true,
  degraded: false,
};

/**
 * useActivityOverview composes the Activity Overview tab: the captured-request
 * health aggregation and the persisted runtime-event aggregation, each read
 * once through its own in-process seam.
 *
 * Both reads are the desktop peers of the MCP's `summary_requests` and
 * `summary_events`, over the same readers the sidecar delegates to. They are
 * deliberately kept as two independent surfaces: the two stores are keyed on
 * different values, so a merged correlation timeline would render an empty
 * request side by construction.
 *
 * Every disclosure is suppressed while the first read is in flight. The
 * starting event aggregation is indistinguishable from an absent store, and
 * announcing that before the read resolves would flash a claim the surface has
 * no evidence for.
 * @param captureSource The captured-request read seam; defaults to the shared singleton.
 * @param eventSource The persisted runtime-event read seam; defaults to the shared singleton.
 * @returns The projected rows, totals, disclosures and empty copy for both surfaces.
 */
export function useActivityOverview(
  captureSource: CaptureTransactionSource = createCaptureTransactionSource(),
  eventSource: RuntimeEventSource = createRuntimeEventSource(),
) {
  // 1. Refs

  // 2. State
  const [isLoading, setIsLoading] = useState(true);
  const [requestSummary, setRequestSummary] = useState<CaptureSummary>(PENDING_REQUEST_SUMMARY);
  const [eventSummary, setEventSummary] = useState<RuntimeEventSummary>(PENDING_EVENT_SUMMARY);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const requestRows = useMemo(() => toRequestHealthRows(requestSummary), [requestSummary]);
  const requestCount = useMemo(() => sumRequestCounts(requestSummary.groups), [requestSummary]);
  const eventSections = useMemo(() => toEventSummarySections(eventSummary), [eventSummary]);
  const eventSamples = useMemo(() => toEventSampleRows(eventSummary), [eventSummary]);
  const requestStatusMessage = isLoading ? null : resolveRequestSummaryStatusMessage(requestSummary.degraded);
  const eventStatusMessage = isLoading ? null : resolveEventStatusMessage(eventSummary.available, eventSummary.degraded);
  const requestEmptyMessage = resolveOverviewEmptyMessage(isLoading, OVERVIEW_REQUESTS_EMPTY_MESSAGE);
  const eventEmptyMessage = resolveOverviewEmptyMessage(isLoading, OVERVIEW_EVENTS_EMPTY_MESSAGE);

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    let active = true;
    setIsLoading(true);

    void Promise.all([captureSource.summarizeTransactions({}), eventSource.summarizeEvents({})]).then(
      ([requests, events]) => {
        if (!active) {
          return;
        }

        setRequestSummary(requests);
        setEventSummary(events);
        setIsLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, [captureSource, eventSource]);

  return {
    isLoading,
    requestRows,
    requestCount,
    requestStatusMessage,
    requestEmptyMessage,
    eventSections,
    eventSamples,
    eventStatusMessage,
    eventEmptyMessage,
  };
}
