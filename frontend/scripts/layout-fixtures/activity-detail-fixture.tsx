import { useEffect, useState } from 'react';
import { ACTIVITY_MASTER_DETAIL_CLASS } from '../../src/features/network/ui/ActivityView/activity-view.constants';
import { NetworkDetail } from '../../src/features/network/ui/NetworkDetail/NetworkDetail';
import { TransactionDetail } from '../../src/features/network/ui/TransactionDetail/TransactionDetail';
import {
  HOSTILE_NETWORK_DETAIL,
  HOSTILE_TRANSACTION_DETAIL,
  METADATA_HEAVY_NETWORK_DETAIL,
  ORDINARY_NETWORK_DETAIL,
  ORDINARY_TRANSACTION_DETAIL,
} from './activity-detail.data';
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
 * The master slot holds a spacer taller than either detail card's own content.
 * That is the condition the second defect was reported under: the rail beside
 * the card made the grid row taller than the card needed, the card stretched to
 * it, and its scrollable pane stayed at a fixed cap with a wide empty band
 * beneath it. An empty master slot cannot reproduce that -- the row would be
 * sized by the card itself, and a "the pane fills its card" check would pass on
 * the broken layout.
 *
 * The spacer's height is the fixture's own, deliberately NOT the rail's class.
 * The promise under test is that the pane fills whatever room the card is
 * given, for any row height; pinning the spacer to today's rail figure would
 * quietly stop testing anything the day the rail got shorter than the card.
 */

/** Marks each fixture grid so its own card can be found without wrapping it. */
const TRANSACTIONS_GRID = '[data-activity-fixture="transactions"]';
/** Same, for the Runtime Events card. */
const RUNTIME_EVENTS_GRID = '[data-activity-fixture="runtime-events"]';
/** The same two cards with ordinary chrome, where a pane has real room to fill. */
const ORDINARY_TRANSACTIONS_GRID = '[data-activity-fixture="ordinary-transactions"]';
/** Same, for the Runtime Events card. */
const ORDINARY_RUNTIME_EVENTS_GRID = '[data-activity-fixture="ordinary-runtime-events"]';
/** The Metadata tab, which has no scrollable pane of its own to hold it in. */
const METADATA_GRID = '[data-activity-fixture="metadata"]';
/** The Trace pane's own marker, which is also what says the fixture has mounted. */
const TRACE_LIST = '[data-network-trace-list]';
/** The Metadata grid's own marker: the box a pretty-printed value could widen. */
const METADATA_LIST = '[data-network-metadata-grid]';

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * How many unused pixels may sit under a scrollable pane.
 *
 * Small because the measurement already excludes every box's own bottom
 * padding, so what is left is sub-pixel rounding -- anything more is the pane
 * declining room the card is holding open for it.
 */
const DEAD_BAND_TOLERANCE_PX = 12;

/** The master-slot spacer: taller than either card's content, so the row has slack to waste. */
const MASTER_SPACER_CLASS = 'h-[56rem]';

/**
 * The least a filled body pane may be left with.
 *
 * Filling means taking the REMAINDER, and this fixture's headers carry a full
 * JDownloader URL over `break-all`, so a headers block that could not give any
 * of it back left the pane 22px of a 512px card. The pane's own floor and the
 * headers block's scroller are what hold this; it is a different promise from
 * the dead-band one, and a pane can keep either while breaking the other.
 */
const MIN_USABLE_PANE_PX = 96;

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
 * The room a box holds open under its own last child.
 *
 * DIRECT children only, which is what makes this readable on a scroller: the
 * rows inside an `overflow-y-auto` list have boxes that run far past their
 * clipped container, so anything that walked the whole subtree would measure
 * the overflow instead of the gap. The box's own bottom padding is not waste,
 * so it comes off first.
 */
function slackInside(box: Element): number {
  const children = [...box.children];
  if (children.length === 0) {
    return 0;
  }
  const paddingBottom = Number.parseFloat(globalThis.getComputedStyle(box).paddingBottom) || 0;
  const lowestChild = Math.max(...children.map((child) => child.getBoundingClientRect().bottom));
  return box.getBoundingClientRect().bottom - paddingBottom - lowestChild;
}

/**
 * Every unused pixel between a pane's bottom edge and the card's.
 *
 * Summed one ancestor at a time rather than taken as a single top-to-bottom
 * subtraction, because the waste can appear at any level of the fill chain --
 * a `Tabs.Panel` that never grew leaves its slack in a different box from a
 * `<pre>` that stopped at a fixed cap -- and a single figure could not say
 * which. Each level contributes only what it itself left over.
 */
function deadBandBelow(pane: Element, card: Element): number {
  let total = 0;
  let node: Element = pane;
  while (node !== card && node.parentElement !== null) {
    node = node.parentElement;
    total += slackInside(node);
  }
  return total;
}

/**
 * What a scrollable pane owes the card it lives in: take the room, and stay
 * inside it.
 *
 * The two halves are deliberately inseparable. A pane that filled by GROWING
 * would satisfy the first alone -- and that is the regression that reopens the
 * horizontal overflow this fixture was built for -- so the card is measured
 * against its own declared budget in the same breath. `max-height: none` reads
 * as unbudgeted and fails, because an uncapped card holding a filling pane is
 * exactly what grows the grid row to the height of a 6916px trace list.
 */
function checkThePaneFills(subject: string, pane: Element, card: Element): readonly Check[] {
  const deadBand = deadBandBelow(pane, card);
  const cardHeight = card.getBoundingClientRect().height;
  const budget = Number.parseFloat(globalThis.getComputedStyle(card).maxHeight);

  return [
    {
      name: `${subject}: the pane fills the height the card leaves it`,
      ok: deadBand <= DEAD_BAND_TOLERANCE_PX,
      detail: `pane ${Math.round(pane.clientHeight)}px, ${Math.round(deadBand)}px unused below it, card ${Math.round(cardHeight)}px`,
    },
    {
      name: `${subject}: the card keeps to its own height budget`,
      ok: cardHeight <= budget + OVERFLOW_TOLERANCE_PX,
      detail: `card ${Math.round(cardHeight)}px, budget ${globalThis.getComputedStyle(card).maxHeight}`,
    },
  ];
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
    {
      // The same promise downwards, and it only became possible to break once
      // the card took a height budget: before that the card grew to whatever
      // its tab held. A tab with no scrollable pane of its own -- General,
      // Metadata -- has to BE the scroller, or its content runs out of the
      // bottom of a card that clips nothing.
      name: `${subject}: nothing spills below the card`,
      ok: card.scrollHeight <= card.clientHeight + OVERFLOW_TOLERANCE_PX,
      detail: `content ${card.scrollHeight}px, card ${card.clientHeight}px`,
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
function measureBodyPane(subject: string, gridSelector: string): readonly Check[] {
  const parts = findAll([`${gridSelector} pre`, `${gridSelector} .card`]);
  if (parts === null) {
    return [absent(`${subject}: the body pane rendered`, `no <pre> inside ${gridSelector}`)];
  }

  const [pane, card] = parts;
  const paneBox = pane.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();

  return [
    {
      name: `${subject}: the body pane stays inside the card`,
      ok: paneBox.right <= cardBox.right + OVERFLOW_TOLERANCE_PX,
      detail: `pane right ${Math.round(paneBox.right)}, card right ${Math.round(cardBox.right)}`,
    },
    {
      name: `${subject}: the unbroken JSON line scrolls inside the body pane`,
      ok: pane.scrollWidth > pane.clientWidth,
      detail: `content ${pane.scrollWidth}px in a ${pane.clientWidth}px pane`,
    },
    {
      name: `${subject}: the body pane is height-bounded`,
      ok: pane.scrollHeight > pane.clientHeight,
      detail: `content ${pane.scrollHeight}px in a ${pane.clientHeight}px pane`,
    },
    {
      name: `${subject}: the body pane keeps a usable height beside tall headers`,
      ok: pane.clientHeight >= MIN_USABLE_PANE_PX,
      detail: `pane ${pane.clientHeight}px, floor ${MIN_USABLE_PANE_PX}px`,
    },
    ...checkThePaneFills(subject, pane, card),
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
function measureTraceList(subject: string, gridSelector: string): readonly Check[] {
  const parts = findAll([`${gridSelector} ${TRACE_LIST}`, `${gridSelector} .card`]);
  if (parts === null) {
    return [absent(`${subject}: the trace list rendered`, `no trace list inside ${gridSelector}`)];
  }

  const [list, card] = parts;

  return [
    {
      name: `${subject}: the trace list stays no taller than its card`,
      ok: list.clientHeight <= card.clientHeight,
      detail: `list ${list.clientHeight}px, card ${card.clientHeight}px`,
    },
    {
      name: `${subject}: the trace list scrolls rather than growing`,
      ok: list.scrollHeight > list.clientHeight,
      detail: `content ${list.scrollHeight}px in a ${list.clientHeight}px list`,
    },
    ...checkThePaneFills(subject, list, card),
  ];
}

/**
 * Measures the Metadata grid.
 *
 * The card checks cannot see this one. The grid is `overflow-y-auto`, and CSS
 * promotes the other axis to `auto` with it, so an over-wide value is absorbed
 * as a horizontal scrollbar INSIDE the grid and never reaches the card's
 * `scrollWidth`. Measured: with `break-all` dropped from the pretty-printed
 * metadata value, every card check stayed green and only this one moved.
 *
 * The second check keeps the first honest, the same way the trace list's pair
 * does: a grid with nothing in it would also fail to scroll sideways.
 */
function measureMetadataGrid(subject: string, gridSelector: string): readonly Check[] {
  const parts = findAll([`${gridSelector} ${METADATA_LIST}`, `${gridSelector} .card`]);
  if (parts === null) {
    return [absent(`${subject}: the metadata grid rendered`, `no metadata grid inside ${gridSelector}`)];
  }

  const [grid, card] = parts;

  return [
    {
      name: `${subject}: the metadata grid never scrolls sideways`,
      ok: grid.scrollWidth <= grid.clientWidth + OVERFLOW_TOLERANCE_PX,
      detail: `content ${grid.scrollWidth}px in a ${grid.clientWidth}px grid`,
    },
    {
      name: `${subject}: the metadata grid scrolls down rather than growing`,
      ok: grid.scrollHeight > grid.clientHeight,
      detail: `content ${grid.scrollHeight}px in a ${grid.clientHeight}px grid`,
    },
    ...checkThePaneFills(subject, grid, card),
  ];
}

/**
 * Every promise the Activity detail cards make, measured in one pass.
 *
 * Each pane is measured twice, against hostile chrome and against ordinary
 * chrome, because the two states answer different questions. Hostile chrome is
 * what proves the containment: an unbroken URL in every row, and nothing may
 * leave the card. Ordinary chrome is what proves the FILL: only there does the
 * pane have enough room for a fixed cap to be reachable, so only there does
 * restoring one show up as a dead band.
 */
function measureActivityDetail(): readonly Check[] {
  return [
    checkThePage('the Activity detail'),
    ...measureCard('Transactions', TRANSACTIONS_GRID),
    ...measureCard('Runtime Events', RUNTIME_EVENTS_GRID),
    ...measureCard('Runtime Events (metadata tab)', METADATA_GRID),
    ...measureMetadataGrid('Runtime Events (metadata tab)', METADATA_GRID),
    ...measureBodyPane('Transactions', TRANSACTIONS_GRID),
    ...measureTraceList('Runtime Events', RUNTIME_EVENTS_GRID),
    ...measureBodyPane('Transactions (ordinary chrome)', ORDINARY_TRANSACTIONS_GRID),
    ...measureTraceList('Runtime Events (ordinary chrome)', ORDINARY_RUNTIME_EVENTS_GRID),
  ];
}

/**
 * Mounts both Activity detail variants on the real master/detail grid and
 * reports what the browser laid out.
 *
 * Each card is pinned to the tab that overflowed in the report -- Response for
 * the JSON body, Trace for the sibling messages -- because HeroUI renders only
 * the selected panel, so an unselected tab is an unmeasured one.
 *
 * The master slot is a spacer rather than the real table: this fixture measures
 * the detail card, and all the rail contributes to that is a row taller than
 * the card's own content.
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
        <div className={MASTER_SPACER_CLASS} />
        <TransactionDetail
          detail={HOSTILE_TRANSACTION_DETAIL}
          detailTab="response"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <div className={ACTIVITY_MASTER_DETAIL_CLASS} data-activity-fixture="runtime-events">
        <div className={MASTER_SPACER_CLASS} />
        <NetworkDetail
          detail={HOSTILE_NETWORK_DETAIL}
          detailTab="trace"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <div className={ACTIVITY_MASTER_DETAIL_CLASS} data-activity-fixture="ordinary-transactions">
        <div className={MASTER_SPACER_CLASS} />
        <TransactionDetail
          detail={ORDINARY_TRANSACTION_DETAIL}
          detailTab="response"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <div className={ACTIVITY_MASTER_DETAIL_CLASS} data-activity-fixture="ordinary-runtime-events">
        <div className={MASTER_SPACER_CLASS} />
        <NetworkDetail
          detail={ORDINARY_NETWORK_DETAIL}
          detailTab="trace"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <div className={ACTIVITY_MASTER_DETAIL_CLASS} data-activity-fixture="metadata">
        <div className={MASTER_SPACER_CLASS} />
        <NetworkDetail
          detail={METADATA_HEAVY_NETWORK_DETAIL}
          detailTab="metadata"
          onClose={() => undefined}
          onDetailTabChange={() => undefined}
        />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}
