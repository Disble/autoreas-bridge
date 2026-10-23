import { useEffect, useState } from 'react';
import { toDrawerHeader, toDrawerSummary } from '../../src/features/activity/drawer/drawer-summary.helpers';
import { toFeedRowModel } from '../../src/features/activity/feed/activity-feed-rows.helpers';
import type { ActivityFeedLine } from '../../src/features/activity/feed-source/feed.types';
import type { ActivityLedgerLine } from '../../src/features/activity/history-source/history.types';
import { ActivityDrawerHeader } from '../../src/features/activity/ui/ActivityDetailDrawer/ActivityDrawerHeader';
import { ActivityDrawerSummary } from '../../src/features/activity/ui/ActivityDetailDrawer/ActivityDrawerSummary';
import { ActivityFeedRow } from '../../src/features/activity/ui/ActivityFeed/ActivityFeedRow';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Activity feed and its detail drawer.
 *
 * It mounts REAL feed rows and the REAL resolved drawer body in two columns:
 * the 1024px pane of a wide window and a 360px phone-width column. The drawer
 * itself is a fixed overlay that reads Wails on mount, so its resolved
 * presentational parts are mounted instead, from the same pure helpers the
 * drawer hook uses. The run story section is left out: it is a live read. The
 * content is hostile: an unbroken stored error, a long route and a long title.
 * One promise is measured in headless Edge, which jsdom cannot measure: nothing
 * widens either column or the page.
 */

/** The two column widths the feed is measured at. */
const COLUMN_WIDTHS_PX = [1024, 360] as const;

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/** The marker of this fixture's columns. */
const COLUMN = '[data-activity-feed-fixture]';

/** An unbroken stored error text, the shape of a Go error chain. */
const LONG_ERROR = `download:${'hoster_probe_failed:context_deadline_exceeded:'.repeat(8)}`;

/** A long route template. */
const LONG_ROUTE = '/api/animes/:id/episodes/:episode/downloads/:download/hosters/:hoster/probes/:probe';

/** A ledger line with every field empty, overridden per line. */
function ledgerLine(overrides: Partial<ActivityLedgerLine>): ActivityLedgerLine {
  return { kind: 'event', id: '1', atMs: Date.UTC(2026, 9, 22, 12, 0), phoneAtMs: undefined, domain: '', source: '', level: '', title: '', detail: '', correlationId: '', beforeJson: '', afterJson: '', marks: [], ...overrides };
}

/** A failed download run whose stored error summary is one unbroken token. */
const FAILED_RUN: ActivityFeedLine = {
  type: 'download',
  origin: 'bridge',
  failed: true,
  slow: false,
  incidentId: undefined,
  traffic: undefined,
  line: ledgerLine({ kind: 'download_run', id: 'run-1' }),
  run: {
    runId: 'run-1',
    trigger: 'scheduled',
    status: 'error',
    startedAtMs: Date.UTC(2026, 9, 22, 12, 0),
    finishedAtMs: Date.UTC(2026, 9, 22, 12, 4),
    animesChecked: 42,
    episodesFound: 7,
    episodesDownloaded: 2,
    episodesFailed: 5,
    skippedCount: 1,
    upToDateCount: 34,
    errorSummary: LONG_ERROR,
  },
};

/** The feed lines: the failed run, an unbroken error title, a long route and a long anime title. */
const HOSTILE_LINES: readonly ActivityFeedLine[] = [
  FAILED_RUN,
  { ...FAILED_RUN, type: 'bridge', run: undefined, incidentId: 9, line: ledgerLine({ id: '2', level: 'error', title: LONG_ERROR }) },
  { ...FAILED_RUN, type: 'bridge', run: undefined, line: ledgerLine({ id: '3', kind: 'phone_report', title: `GET ${LONG_ROUTE}`, detail: `500 ${LONG_ROUTE}` }) },
  { ...FAILED_RUN, type: 'change', origin: 'phone', failed: false, run: undefined, line: ledgerLine({ id: '4', kind: 'change', source: 'mobile', title: 'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen - Ryoushu no Youjo', detail: 'episode_adjusted', beforeJson: '{"NroCapVisto":0}', afterJson: '{"NroCapVisto":1}' }) },
];

/** The rows as the feed words them, the failed run open. */
const HOSTILE_ROWS = HOSTILE_LINES.map((line) => toFeedRowModel(line, 'download_run:run-1'));

/** The drawer's resolved summary of the failed run, without its live run story. */
const RUN_SECTIONS = toDrawerSummary({ line: FAILED_RUN, incident: undefined, metadata: undefined, nowMs: Date.UTC(2026, 9, 22, 13, 0) }).sections.filter((section) => section.kind !== 'run-story');

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

/** The check of one column: nothing widens it. */
function measureColumn(column: Element): Check {
  const width = column.getAttribute('data-activity-feed-fixture') ?? '?';
  return {
    name: `activity-feed@${width}: nothing widens the column`,
    ok: column.scrollWidth <= column.clientWidth + OVERFLOW_TOLERANCE_PX,
    detail: `scrollWidth ${column.scrollWidth}, clientWidth ${column.clientWidth}, widest ${describeWidest(column)}`,
  };
}

/**
 * Reads back both columns.
 *
 * @returns Every check the feed and drawer must pass.
 */
function measureActivityFeed(): readonly Check[] {
  const columns = [...document.querySelectorAll(COLUMN)];
  if (columns.length !== COLUMN_WIDTHS_PX.length) {
    return [{ name: 'activity-feed: both columns rendered', ok: false, detail: `${columns.length} columns` }];
  }
  return [...columns.map(measureColumn), checkThePage('activity-feed')];
}

/** Whether both columns hold every row and the drawer summary. */
function isActivityFeedMounted(): boolean {
  return document.querySelectorAll(`${COLUMN} [data-feed-row]`).length === HOSTILE_ROWS.length * COLUMN_WIDTHS_PX.length && document.querySelectorAll(`${COLUMN} [data-testid="activity-drawer-summary"]`).length === COLUMN_WIDTHS_PX.length;
}

/** The feed rows and the open run's drawer body in a 1024px and a 360px column, measured once mounted. */
export function ActivityFeedFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => measureWhenReady(isActivityFeedMounted, () => setChecks(measureActivityFeed())), []);

  return (
    <>
      {COLUMN_WIDTHS_PX.map((width) => (
        <div className="flex flex-col gap-5" data-activity-feed-fixture={width} key={width} style={{ width: `${width}px`, maxWidth: '100%' }}>
          <div className="flex flex-col">
            {HOSTILE_ROWS.map((row) => (
              <ActivityFeedRow key={row.key} onSelect={() => undefined} row={row} />
            ))}
          </div>
          <ActivityDrawerHeader header={toDrawerHeader(FAILED_RUN)} onClose={() => undefined} onCopy={() => undefined} onToggleTechnical={() => undefined} technical={false} />
          <ActivityDrawerSummary sections={RUN_SECTIONS} />
        </div>
      ))}
      <VerdictReport checks={checks} />
    </>
  );
}
