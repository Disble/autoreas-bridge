import { useEffect, useState } from 'react';
import { ActivityNowContent } from '../../src/features/activity/ui/ActivityNow/ActivityNowContent';
import { toActivityNowModel } from '../../src/features/activity/ui/ActivityNow/activity-now.helpers';
import type { ActivityNowView } from '../../src/features/activity/activity-source/activity.types';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Activity Now tab.
 *
 * It mounts the REAL resolved content in a narrow column with the longest
 * strings the tab can receive: a long incident title, a long anime name and
 * the widest figures. Two promises are measured in headless Edge, which jsdom
 * cannot measure: nothing widens the column or the page, and every one of the
 * 24 hourly bars keeps a visible width.
 */

/** The narrow column the tab is squeezed into. */
const COLUMN_WIDTH_PX = 360;

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/** The marker of this fixture's column. */
const COLUMN = '[data-activity-now-fixture]';

/** A long title the way Go words an incident. */
const LONG_TITLE = 'Sync failed for 5 requests at once while the bridge could not read its list of changes';

/** A long anime title, kept verbatim from the toast fixture's overflow case. */
const LONG_NAME = 'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen - Ryoushu no Youjo';

/** A resolved view with gaps, failures and hostile strings. */
const HOSTILE_VIEW: ActivityNowView = {
  status: { kind: 'problems', sentence: '12 problems need a look', quietMinutes: 0, problems: 12 },
  lastPhoneContactMs: 0,
  uptimeMs: 400 * 3_600_000,
  requestsToday: 1_234_567,
  openIncidents: 12,
  changesToday: 98_765,
  hours: Array.from({ length: 24 }, (_unused, index) => ({
    hourStartMs: index * 3_600_000,
    count: index % 5 === 0 ? 0 : index * 40,
    failed: index * 4,
    failedShare: index % 5 === 0 ? 0 : 0.1,
    hasData: index % 5 !== 0,
  })),
  needsALook: [
    { latestId: 1, fingerprint: 'f', reason: 'r', title: LONG_TITLE, latestAtMs: 0, firstSeenAtMs: 0, occurrences: 5, isNew: true, isError: true },
  ],
  recentChanges: [
    {
      id: 1,
      atMs: 0,
      reportedAtMs: undefined,
      source: 'mobile',
      actionType: 'episode_adjusted',
      animeId: 'a',
      animeName: LONG_NAME,
      correlationId: '',
      beforeJson: '{"NroCapVisto":1000}',
      afterJson: '{"NroCapVisto":1001}',
    },
  ],
};

/**
 * Reads back the column and its bars.
 *
 * @returns Every check the Now content must pass.
 */
function measureActivityNow(): readonly Check[] {
  const column = document.querySelector(COLUMN);
  const bars = [...document.querySelectorAll(`${COLUMN} [data-hour-bar]`)];
  if (column === null) {
    return [{ name: 'activity-now: the content rendered', ok: false, detail: 'column absent' }];
  }
  const nodes = [...column.querySelectorAll('*')];
  const widestNode = nodes.reduce((wide, node) => (node.getBoundingClientRect().right > wide.getBoundingClientRect().right ? node : wide), column);
  const widest = widestNode.getBoundingClientRect().right;
  const columnRight = column.getBoundingClientRect().right;
  const thinBars = bars.filter((bar) => bar.getBoundingClientRect().width < 1).length;
  return [
    {
      name: 'activity-now: no box grows past the column',
      ok: widest <= columnRight + OVERFLOW_TOLERANCE_PX,
      detail: `widest right edge ${Math.round(widest)}px (<${widestNode.tagName.toLowerCase()} class="${widestNode.getAttribute('class') ?? ''}">), column right edge ${Math.round(columnRight)}px`,
    },
    {
      name: 'activity-now: all 24 hourly bars keep a visible width',
      ok: bars.length === 24 && thinBars === 0,
      detail: `${bars.length} bars, ${thinBars} narrower than 1px`,
    },
    checkThePage('activity-now'),
  ];
}

/** The Now content in a narrow column, measured once it mounted. */
export function ActivityNowFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => measureWhenReady(() => document.querySelector(`${COLUMN} [data-hour-bar]`) !== null, () => setChecks(measureActivityNow())), []);

  return (
    <>
      <div data-activity-now-fixture style={{ width: `${COLUMN_WIDTH_PX}px` }}>
        <ActivityNowContent model={toActivityNowModel(HOSTILE_VIEW, 60_000)} onOpenIncident={() => undefined} />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}
