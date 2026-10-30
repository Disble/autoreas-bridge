import { DragDropProvider } from '@dnd-kit/react';
import { useEffect, useState } from 'react';
import { WEEKDAYS } from '../../src/features/season/ui/OrderingBoard/ordering-board.constants';
import { OrderingWeekdayGrid } from '../../src/features/season/ui/OrderingBoard/OrderingWeekdayGrid';
import { FIXTURE_COLUMNS, FIXTURE_COUNTS, FIXTURE_META } from './season-ordering.data';
import { measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Ordering board's weekday grid.
 *
 * It mounts the REAL `OrderingWeekdayGrid` -- the component `OrderingBoard`
 * renders -- with its real lanes and sortable cards inside a real
 * `DragDropProvider`, fed synthetic cards, and measures what the browser laid
 * out. The reported defect was a fixed seven-track grid that squeezed each lane
 * to 136px at the screenshot's content width and scrolled sideways. jsdom has no
 * layout engine, so only geometry can say whether a lane is comfortable.
 *
 * The widths are CONTAINER widths (wrappers), not viewports: the grid sizes its
 * lanes from the room its container leaves, so the wrapper is what varies. The
 * runner's window only has to be at least as wide as the widest wrapper; it
 * does not change any measurement here.
 */

/** The container widths the grid is measured at, named for the situation each stands for. */
const ORDERING_WIDTHS = [
  { name: 'narrow', px: 320, minColumns: 1 },
  { name: 'screenshot', px: 880, minColumns: 3 },
  { name: 'wide', px: 1200, minColumns: 4 },
] as const;

/** Attribute that marks each width wrapper so its grid can be found. */
const WRAPPER_ATTRIBUTE = 'data-season-ordering-fixture';

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/** The narrowest a lane may be where its container has the room (14rem at the default root size). */
const MIN_LANE_PX = 224;

/** The narrowest a card may be, which is what keeps its name and four-button action row readable. */
const MIN_CARD_PX = 192;

/** Whether a box lies fully inside another, within the overflow tolerance. */
function isInsideHorizontally(inner: Element, outer: Element): boolean {
  const innerBox = inner.getBoundingClientRect();
  const outerBox = outer.getBoundingClientRect();
  return innerBox.width > 0 && innerBox.left >= outerBox.left - OVERFLOW_TOLERANCE_PX && innerBox.right <= outerBox.right + OVERFLOW_TOLERANCE_PX;
}

/** The distinct rounded values of a measurement, in ascending order. */
function distinct(values: readonly number[]): readonly number[] {
  return [...new Set(values.map((value) => Math.round(value)))].toSorted((a, b) => a - b);
}

/** Every element from `start` up to and including `stop` that scrolls sideways, as a readable list. */
function sidewaysScrollers(start: Element, stop: Element): readonly string[] {
  const scrollers: string[] = [];
  for (let node: Element | null = start; node !== null; node = node === stop ? null : node.parentElement) {
    if (node.scrollWidth > node.clientWidth + OVERFLOW_TOLERANCE_PX) {
      scrollers.push(`${node.tagName.toLowerCase()} ${node.scrollWidth}>${node.clientWidth}`);
    }
  }
  return scrollers;
}

/** The lanes of one wrapper in document order: each drop zone's parent is the lane holding its header. */
function findLanes(wrapper: Element): readonly Element[] {
  return [...wrapper.querySelectorAll('[role="group"]')].map((zone) => zone.parentElement ?? zone);
}

/** Checks the seven lanes exist, in order, and are laid out in as many columns as the width allows. */
function measureLanes(name: string, px: number, minColumns: number, wrapper: Element): readonly Check[] {
  const zones = [...wrapper.querySelectorAll('[role="group"]')];
  const labels = zones.map((zone) => zone.getAttribute('aria-label'));
  const boxes = findLanes(wrapper).map((lane) => lane.getBoundingClientRect());
  const columns = distinct(boxes.map((box) => box.left));
  const rows = distinct(boxes.map((box) => box.top));
  const narrowest = Math.min(...boxes.map((box) => box.width));

  return [
    {
      name: `${name}: all seven weekday lanes render in order`,
      ok: labels.length === WEEKDAYS.length && labels.every((label, index) => label === WEEKDAYS[index]),
      detail: `${labels.length} lane(s): ${labels.join(', ')}`,
    },
    {
      name: `${name}: the lanes wrap into at least ${minColumns} column(s) and ceil(7/columns) row(s)`,
      ok: columns.length >= minColumns && rows.length === Math.ceil(WEEKDAYS.length / columns.length),
      detail: `${columns.length} column(s) at x=${columns.join(',')}; ${rows.length} row(s) at y=${rows.join(',')}; container ${px}px`,
    },
    {
      name: `${name}: every lane is comfortably wide`,
      ok: narrowest >= Math.min(MIN_LANE_PX, px) - OVERFLOW_TOLERANCE_PX,
      detail: `lanes ${boxes.map((box) => Math.round(box.width)).join('/')}px, floor ${Math.min(MIN_LANE_PX, px)}px`,
    },
  ];
}

/** The box that holds the lanes -- the grid, or whatever now wraps it -- or the wrapper when there are no lanes. */
function laneContainer(lanes: readonly Element[], wrapper: Element): Element {
  return lanes[0]?.parentElement ?? wrapper;
}

/** Checks nothing from the lanes' container up to the wrapper scrolls sideways. */
function measureScrolling(name: string, wrapper: Element, lanes: readonly Element[]): readonly Check[] {
  const scrollers = sidewaysScrollers(laneContainer(lanes, wrapper), wrapper);

  return [
    {
      name: `${name}: nothing around the lanes scrolls sideways`,
      ok: scrollers.length === 0 && lanes.length > 0,
      detail: scrollers.length === 0 ? 'no sideways scroller' : scrollers.join('; '),
    },
  ];
}

/** Checks every lane lies inside the container rather than spilling out of it. */
function measureLaneBounds(name: string, wrapper: Element, lanes: readonly Element[]): readonly Check[] {
  const wrapperBox = wrapper.getBoundingClientRect();
  const rightEdge = Math.max(...lanes.map((lane) => lane.getBoundingClientRect().right));

  return [
    {
      name: `${name}: every lane stays inside the container`,
      ok: lanes.length > 0 && lanes.every((lane) => isInsideHorizontally(lane, wrapper)),
      detail: `container ${Math.round(wrapperBox.width)}px, lanes right edge ${Math.round(rightEdge - wrapperBox.left)}px`,
    },
  ];
}

/** Checks nothing between the lanes and the container scrolls or spills sideways. */
function measureContainment(name: string, wrapper: Element): readonly Check[] {
  const lanes = findLanes(wrapper);
  return [...measureScrolling(name, wrapper, lanes), ...measureLaneBounds(name, wrapper, lanes)];
}

/** Checks each card is comfortable and its buttons stay inside it, which is what a cramped lane breaks. */
function measureCards(name: string, wrapper: Element): readonly Check[] {
  const cards = [...wrapper.querySelectorAll('li')];
  const buttons = cards.flatMap((item) => [...item.querySelectorAll('button')]);
  const outside = cards.filter((item) => !isInsideHorizontally(item, item.closest('[role="group"]') ?? wrapper));
  const buttonsOutside = cards.flatMap((item) => [...item.querySelectorAll('button')].filter((button) => !isInsideHorizontally(button, item)));
  const narrowest = Math.min(...cards.map((item) => item.getBoundingClientRect().width));

  return [
    {
      name: `${name}: every card is comfortably wide`,
      ok: cards.length > 0 && narrowest >= MIN_CARD_PX - OVERFLOW_TOLERANCE_PX,
      detail: `${cards.length} card(s), narrowest ${Math.round(narrowest)}px, floor ${MIN_CARD_PX}px`,
    },
    {
      name: `${name}: every card and every button stays inside its box`,
      ok: outside.length === 0 && buttonsOutside.length === 0 && buttons.length > 0,
      detail: `${buttons.length} button(s); ${outside.length} card(s) and ${buttonsOutside.length} button(s) outside`,
    },
  ];
}

/** Measures every wrapper on the page, reporting a missing wrapper as a failure. */
function measureAll(): readonly Check[] {
  return ORDERING_WIDTHS.flatMap(({ name, px, minColumns }) => {
    const wrapper = document.querySelector(`[${WRAPPER_ATTRIBUTE}="${name}"]`);
    if (wrapper === null) {
      return [{ name: `${name}: the wrapper rendered`, ok: false, detail: `no wrapper at ${px}px` }];
    }
    return [...measureLanes(name, px, minColumns, wrapper), ...measureContainment(name, wrapper), ...measureCards(name, wrapper)];
  });
}

/** Every card action is a no-op: the fixture measures geometry and never acts on a card. */
const NO_OP = () => undefined;

/** Every card renders the fixed-size placeholder cover, which occupies the same slot as a real one. */
const NO_COVER = () => ({ coverSrc: undefined, isLoading: false });

/** Mounts the real weekday grid at each container width and measures it once the lanes are on screen. */
export function SeasonOrderingFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(
    () =>
      measureWhenReady(
        () => document.querySelectorAll(`[${WRAPPER_ATTRIBUTE}] [role="group"]`).length === ORDERING_WIDTHS.length * WEEKDAYS.length,
        () => setChecks(measureAll()),
      ),
    [],
  );

  return (
    <>
      {ORDERING_WIDTHS.map(({ name, px }) => (
        <div key={name} {...{ [WRAPPER_ATTRIBUTE]: name }} style={{ width: px }}>
          <DragDropProvider>
            <OrderingWeekdayGrid
              columns={FIXTURE_COLUMNS}
              readOnly={false}
              meta={FIXTURE_META}
              counts={FIXTURE_COUNTS}
              onDuplicate={NO_OP}
              onRemove={NO_OP}
              onOpenPage={NO_OP}
              onCopyPage={NO_OP}
              onOpenFolder={NO_OP}
              onCopyFolder={NO_OP}
              getCoverThumb={NO_COVER}
            />
          </DragDropProvider>
        </div>
      ))}
      <VerdictReport checks={checks} />
    </>
  );
}
