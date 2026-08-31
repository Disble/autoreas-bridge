import { useEffect, useState } from 'react';
import { ACTIVITY_MASTER_DETAIL_CLASS } from '../../src/features/network/ui/ActivityView/activity-view.constants';
import { NetworkDetail } from '../../src/features/network/ui/NetworkDetail/NetworkDetail';
import { TransactionDetail } from '../../src/features/network/ui/TransactionDetail/TransactionDetail';
import { HOSTILE_NETWORK_DETAIL, HOSTILE_TRANSACTION_DETAIL } from './activity-detail.data';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Activity detail cards.
 *
 * It mounts the REAL `TransactionDetail` and `NetworkDetail` on the REAL grid
 * both Activity rails use (`ACTIVITY_MASTER_DETAIL_CLASS`), feeds them content
 * modelled on what the user had on screen when the whole application window
 * grew a horizontal scrollbar, and measures the boxes the browser produced.
 *
 * The grid class is imported rather than spelled out here on purpose. Nothing
 * in this file may restate a class the components own: the bug being guarded
 * lived entirely in track sizing and `min-width`, so a fixture carrying its own
 * copy of the layout would keep passing after the panels regressed.
 *
 * The master slot is left empty. The left column is a fixed share of the grid
 * either way, and an empty item is honest about what this fixture measures --
 * the detail card, which is the side that overflowed.
 */

/** Marks each fixture grid so its own card can be found without wrapping it. */
const TRANSACTIONS_GRID = '[data-activity-fixture="transactions"]';
/** Same, for the Runtime Events card. */
const RUNTIME_EVENTS_GRID = '[data-activity-fixture="runtime-events"]';
/** The Trace pane's own marker, which is also what says the fixture has mounted. */
const TRACE_LIST = '[data-network-trace-list]';

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * Resolves every selector a measurement needs, or nothing at all.
 *
 * One lookup for all of them, so each measurement below is left with a single
 * guard: "it did not render" is a different failure from "it rendered wrong",
 * and the fixture has to be able to say which without four branches per check.
 */
function findAll(selectors: readonly string[]): readonly Element[] | null {
  const found = selectors.map((selector) => document.querySelector(selector));
  return found.includes(null) ? null : (found as readonly Element[]);
}

/** The check a measurement reports when its subject never rendered. */
function absent(name: string, detail: string): Check {
  return { name, ok: false, detail };
}

/**
 * Measures one detail card against the grid column it was placed in.
 *
 * `scrollWidth` vs `clientWidth` is the check that matters: `.card` is
 * `overflow: visible`, so a pane that runs past it shows up here as content
 * wider than the card's own box -- which is precisely the state that then grew
 * the grid track, and with it the page.
 */
function measureCard(subject: string, gridSelector: string): readonly Check[] {
  const parts = findAll([gridSelector, `${gridSelector} .card`]);
  if (parts === null) {
    return [absent(`${subject}: the card rendered`, `nothing matched ${gridSelector} .card`)];
  }

  const [grid, card] = parts;
  const gridBox = grid.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();

  return [
    {
      name: `${subject}: the card stays inside its column`,
      ok: cardBox.right <= gridBox.right + OVERFLOW_TOLERANCE_PX,
      detail: `card right ${Math.round(cardBox.right)}, grid right ${Math.round(gridBox.right)}`,
    },
    {
      name: `${subject}: nothing spills out of the card`,
      ok: card.scrollWidth <= card.clientWidth + OVERFLOW_TOLERANCE_PX,
      detail: `content ${card.scrollWidth}px, card ${card.clientWidth}px`,
    },
  ];
}

/**
 * Measures the Raw/Pretty body pane.
 *
 * Code is the one thing here that must NOT wrap -- breaking a JSON line changes
 * what it says -- so the promise it keeps instead is that the overflow belongs
 * to the pane, in both axes, and never reaches the window.
 */
function measureBodyPane(): readonly Check[] {
  const parts = findAll([`${TRANSACTIONS_GRID} pre`, `${TRANSACTIONS_GRID} .card`]);
  if (parts === null) {
    return [absent('Transactions: the body pane rendered', 'no <pre> inside the transactions card')];
  }

  const [pane, card] = parts;
  const paneBox = pane.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();

  return [
    {
      name: 'Transactions: the body pane stays inside the card',
      ok: paneBox.right <= cardBox.right + OVERFLOW_TOLERANCE_PX,
      detail: `pane right ${Math.round(paneBox.right)}, card right ${Math.round(cardBox.right)}`,
    },
    {
      name: 'Transactions: the unbroken JSON line scrolls inside the body pane',
      ok: pane.scrollWidth > pane.clientWidth,
      detail: `content ${pane.scrollWidth}px in a ${pane.clientWidth}px pane`,
    },
    {
      name: 'Transactions: the body pane is height-bounded',
      ok: pane.scrollHeight > pane.clientHeight,
      detail: `content ${pane.scrollHeight}px in a ${pane.clientHeight}px pane`,
    },
  ];
}

/**
 * Measures the Trace list.
 *
 * The two checks are deliberately a pair: the second one is what keeps the
 * first honest. A list that simply had nothing in it would also be "shorter
 * than the card", so the fixture also asserts that there IS more content than
 * the bound shows -- which is only true because the bound is doing work.
 */
function measureTraceList(): readonly Check[] {
  const parts = findAll([`${RUNTIME_EVENTS_GRID} ${TRACE_LIST}`, `${RUNTIME_EVENTS_GRID} .card`]);
  if (parts === null) {
    return [absent('Runtime Events: the trace list rendered', 'no trace list inside the runtime-events card')];
  }

  const [list, card] = parts;

  return [
    {
      name: 'Runtime Events: the trace list stays no taller than its card',
      ok: list.clientHeight <= card.clientHeight,
      detail: `list ${list.clientHeight}px, card ${card.clientHeight}px`,
    },
    {
      name: 'Runtime Events: the trace list scrolls rather than growing',
      ok: list.scrollHeight > list.clientHeight,
      detail: `content ${list.scrollHeight}px in a ${list.clientHeight}px list`,
    },
  ];
}

/** Every promise the Activity detail cards make, measured in one pass. */
function measureActivityDetail(): readonly Check[] {
  return [
    checkThePage('the Activity detail'),
    ...measureCard('Transactions', TRANSACTIONS_GRID),
    ...measureCard('Runtime Events', RUNTIME_EVENTS_GRID),
    ...measureBodyPane(),
    ...measureTraceList(),
  ];
}

/**
 * Mounts both Activity detail variants on the real master/detail grid and
 * reports what the browser laid out.
 *
 * Each card is pinned to the tab that overflowed in the report -- Response for
 * the JSON body, Trace for the sibling messages -- because HeroUI renders only
 * the selected panel, so an unselected tab is an unmeasured one.
 */
export function ActivityDetailFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => {
    return measureWhenReady(
      () => document.querySelector(`${RUNTIME_EVENTS_GRID} ${TRACE_LIST}`) !== null,
      () => setChecks(measureActivityDetail()),
    );
  }, []);

  return (
    <>
      <div className={ACTIVITY_MASTER_DETAIL_CLASS} data-activity-fixture="transactions">
        <div />
        <TransactionDetail
          detail={HOSTILE_TRANSACTION_DETAIL}
          detailTab="response"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <div className={ACTIVITY_MASTER_DETAIL_CLASS} data-activity-fixture="runtime-events">
        <div />
        <NetworkDetail
          detail={HOSTILE_NETWORK_DETAIL}
          detailTab="trace"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}
