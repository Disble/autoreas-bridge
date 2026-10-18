import { useEffect, useState } from 'react';
import { ActivityIncidentDetailContent } from '../../src/features/activity/ui/ActivityIncidents/ActivityIncidentDetailContent';
import { ActivityRequestPane } from '../../src/features/activity/ui/ActivityIncidents/ActivityRequestPane';
import { toActivityIncidentDetailModel } from '../../src/features/activity/ui/ActivityIncidents/activity-incident-detail.helpers';
import { toActivityRequestDetailModel } from '../../src/features/activity/ui/ActivityIncidents/activity-request-detail.helpers';
import type { ActivityIncidentDetail, ActivityRequestDetail } from '../../src/features/activity/activity-source/activity-incident.types';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Activity incident detail.
 *
 * It mounts the REAL resolved detail, with a picked request, in two columns:
 * the 1024px pane of a wide window and a 360px phone-width column. The
 * content is hostile: an unbroken cause, a long route template and a compact
 * one-line body. Three promises are measured in headless Edge, which jsdom
 * cannot measure: nothing widens either column or the page, every lane keeps
 * a usable width, and every marker sits on its own lane.
 */

/** The two column widths the detail is measured at. */
const COLUMN_WIDTHS_PX = [1024, 360] as const;

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/** The narrowest a lane track may become and still place markers apart. */
const MIN_LANE_WIDTH_PX = 120;

/** The marker of this fixture's columns. */
const COLUMN = '[data-activity-incident-fixture]';

/** An unbroken stored error text, the shape of a Go error chain. */
const LONG_CAUSE = `activityread:${'list_changes_failed:database_is_locked:'.repeat(8)}`;

/** A long route template. */
const LONG_ROUTE = '/api/animes/:id/episodes/:episode/downloads/:download/hosters/:hoster/probes/:probe';

/** A request incident whose window fills every lane, markers at both edges. */
const HOSTILE_DETAIL: ActivityIncidentDetail = {
  incident: {
    id: 42,
    fingerprint: 'fp',
    reason: 'http_5xx',
    title: 'Sync failed for 5 requests at once while the bridge could not read its list of changes',
    occurredAtMs: 120_000,
    windowStartMs: 0,
    windowEndMs: 150_000,
    sourceKind: 'request',
    sourceId: 'req-9',
  },
  cause: { known: true, errorCode: 'list_changes_failed', message: LONG_CAUSE },
  requests: [
    { routeTemplate: LONG_ROUTE, httpStatus: 500, count: 1_234, firstAtMs: 0, lastAtMs: 150_000, latestRequestId: 'req-9', kind: 'http', outcome: 'completed', maxDurationMs: 125_000, containsTrigger: true },
    { routeTemplate: '/api/sync/changes', httpStatus: 200, count: 3, firstAtMs: 30_000, lastAtMs: 90_000, latestRequestId: 'req-2', kind: 'http', outcome: 'completed', maxDurationMs: 41, containsTrigger: false },
  ],
  events: [{ id: 7, atMs: 0, domain: 'sync', level: 'warn', eventType: 'sync.slow', message: 'slow', correlationId: '' }],
  phoneReports: [{ id: 3, atMs: 150_000, phoneAtMs: undefined, deviceId: 'd', kind: 'cycle_report', outcome: 'failed' }],
  earlier: [{ id: 40, occurredAtMs: 0 }],
  expiresAtMs: 0,
};

/** The picked request: a one-line compact body longer than the preview. */
const HOSTILE_REQUEST: ActivityRequestDetail = {
  requestId: 'req-9',
  capturedAtMs: 120_000,
  kind: 'http',
  route: LONG_ROUTE,
  transport: 'http',
  outcome: 'completed',
  errorCode: 'list_changes_failed',
  httpStatus: 500,
  durationMs: 41,
  requestBody: undefined,
  requestBodyState: '',
  responseBody: `{"error":"list_changes_failed","pad":"${'x'.repeat(4_000)}"}`,
  responseBodyState: 'truncated',
  deviceName: 'Pixel 8 Pro with a very long device name',
};

/** Whether a box between the node and the column clips or scrolls what overflows it. */
function isClippedBelow(node: Element, column: Element): boolean {
  for (let parent = node.parentElement; parent !== null && parent !== column; parent = parent.parentElement) {
    if (getComputedStyle(parent).overflowX !== 'visible') {
      return true;
    }
  }
  return false;
}

/** Names the box that sticks out of the column furthest, for the failure detail. */
function describeWidest(column: Element): string {
  const right = column.getBoundingClientRect().right;
  const sticking = [...column.querySelectorAll('*')].filter((node) => !isClippedBelow(node, column) && node.getBoundingClientRect().right > right + OVERFLOW_TOLERANCE_PX);
  const widest = sticking.sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).at(0);
  return widest === undefined ? 'none' : `<${widest.tagName.toLowerCase()} class="${widest.getAttribute('class') ?? ''}"> right ${Math.round(widest.getBoundingClientRect().right)}px`;
}

/** Checks of one column: it is not widened, and its lanes and markers keep their geometry. */
function measureColumn(column: Element): readonly Check[] {
  const width = column.getAttribute('data-activity-incident-fixture') ?? '?';
  const lanes = [...column.querySelectorAll('[data-lane]')];
  const narrowLanes = lanes.filter((lane) => lane.getBoundingClientRect().width < MIN_LANE_WIDTH_PX).length;
  const strayMarkers = lanes.flatMap((lane) => {
    const track = lane.getBoundingClientRect();
    return [...lane.querySelectorAll('[data-lane-marker]')].filter((marker) => {
      const box = marker.getBoundingClientRect();
      const center = box.left + box.width / 2;
      return center < track.left - OVERFLOW_TOLERANCE_PX || center > track.right + OVERFLOW_TOLERANCE_PX;
    });
  }).length;
  return [
    {
      name: `activity-incident@${width}: nothing widens the column`,
      ok: column.scrollWidth <= column.clientWidth + OVERFLOW_TOLERANCE_PX,
      detail: `scrollWidth ${column.scrollWidth}, clientWidth ${column.clientWidth}, widest ${describeWidest(column)}`,
    },
    {
      name: `activity-incident@${width}: all 3 lanes keep a usable width`,
      ok: lanes.length === 3 && narrowLanes === 0,
      detail: `${lanes.length} lanes, ${narrowLanes} narrower than ${MIN_LANE_WIDTH_PX}px`,
    },
    {
      name: `activity-incident@${width}: every marker sits on its lane`,
      ok: strayMarkers === 0,
      detail: `${strayMarkers} markers off their lane`,
    },
  ];
}

/**
 * Reads back both columns.
 *
 * @returns Every check the incident detail must pass.
 */
function measureActivityIncident(): readonly Check[] {
  const columns = [...document.querySelectorAll(COLUMN)];
  if (columns.length !== COLUMN_WIDTHS_PX.length) {
    return [{ name: 'activity-incident: both columns rendered', ok: false, detail: `${columns.length} columns` }];
  }
  return [...columns.flatMap(measureColumn), checkThePage('activity-incident')];
}

/** The incident detail with a picked request in a 1024px and a 360px column, measured once mounted. */
export function ActivityIncidentFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => measureWhenReady(() => document.querySelectorAll(`${COLUMN} [data-lane]`).length === 6, () => setChecks(measureActivityIncident())), []);

  return (
    <>
      {COLUMN_WIDTHS_PX.map((width) => (
        <div data-activity-incident-fixture={width} key={width} style={{ width: `${width}px`, maxWidth: '100%' }}>
          <ActivityIncidentDetailContent
            model={toActivityIncidentDetailModel(HOSTILE_DETAIL)}
            onCopy={() => undefined}
            onSelectRequest={() => undefined}
            requestPane={
              <ActivityRequestPane
                isBodyOpen={() => false}
                model={toActivityRequestDetailModel(HOSTILE_REQUEST)}
                onRetry={() => undefined}
                onToggleBody={() => undefined}
                request={{ status: 'ready', value: HOSTILE_REQUEST }}
              />
            }
            selectedRequestId="req-9"
          />
        </div>
      ))}
      <VerdictReport checks={checks} />
    </>
  );
}
