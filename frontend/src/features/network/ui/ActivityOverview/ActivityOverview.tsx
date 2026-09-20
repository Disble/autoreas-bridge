import { ActivityOverviewEventSummaryCard } from './ActivityOverviewEventSummaryCard';
import { ActivityOverviewRequestHealthCard } from './ActivityOverviewRequestHealthCard';
import { OVERVIEW_PARITY_NOTE } from './activity-overview.constants';
import type { ActivityOverviewProps } from './activity-overview.types';
import { useActivityOverview } from './use-activity-overview';

/**
 * ActivityOverview is the aggregate surface inside Activity: captured-request
 * health grouped by route/status/outcome, and persisted runtime-event counts
 * grouped by domain, level and event type. It is the desktop equivalent of the
 * MCP's `summary_requests` and `summary_events`, so a human can ask "which
 * routes are failing, how often" without an agent.
 *
 * The two aggregations stay side by side rather than merged: the stores are
 * keyed on different values, so a combined correlation timeline would render an
 * empty request side by construction. All data flows from `useActivityOverview`
 * into the two colocated cards; this component only composes the status strip,
 * the parity note and the cards.
 */
export function ActivityOverview({ captureSource, eventSource, statusStrip }: Readonly<ActivityOverviewProps>) {
  const {
    isLoading,
    requestRows,
    requestCount,
    requestStatusMessage,
    requestEmptyMessage,
    eventSections,
    eventSamples,
    eventStatusMessage,
    eventEmptyMessage,
  } = useActivityOverview(captureSource, eventSource);

  return (
    <div className="flex flex-col gap-4">
      {/* The status strip is composed by the app layer and rendered here, ABOVE
          the aggregation content: this tab answers "what is the bridge doing",
          and bridge storage status is that question. Because the strip lives in
          this tab, `/activity/runtime-events` no longer shows it — the intended
          outcome of the placement decision. Absence renders nothing. */}
      {statusStrip != null ? <div className="min-w-0">{statusStrip}</div> : null}

      <p className="text-[11px] text-muted">{OVERVIEW_PARITY_NOTE}</p>

      <ActivityOverviewRequestHealthCard
        isLoading={isLoading}
        requestCount={requestCount}
        requestEmptyMessage={requestEmptyMessage}
        requestRows={requestRows}
        requestStatusMessage={requestStatusMessage}
      />

      <ActivityOverviewEventSummaryCard
        eventEmptyMessage={eventEmptyMessage}
        eventSamples={eventSamples}
        eventSections={eventSections}
        eventStatusMessage={eventStatusMessage}
        isLoading={isLoading}
      />
    </div>
  );
}
