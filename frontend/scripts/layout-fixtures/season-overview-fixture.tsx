import { useEffect, useState } from 'react';
import { SeasonOverviewCard } from '../../src/features/season/ui/SeasonWorkspace/SeasonOverviewCard';
import type { SeasonOverview } from '../../src/features/season/ui/SeasonWorkspace/season-workspace.types';
import { measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the open season's Overview card.
 *
 * It mounts the REAL `SeasonOverviewCard` inside width-constrained wrappers and
 * measures the boxes the browser produced. The reported defect was a card about
 * 520px tall for three short facts and one button: `Card.Content` is a flex
 * COLUMN, so the fact list's `basis-104` became a 26rem HEIGHT. jsdom cannot see
 * that, and a class assertion would only prove the class is present, so the
 * promise is checked as geometry: a fact list no taller than its facts, a
 * compact card, and the controls inside the card.
 *
 * The widths are wrappers rather than viewports so the runner's existing
 * viewports stay untouched: a narrow phone-like column, the width left beside
 * the sidebar in the reported screenshot, and a wide column.
 */

/** The widths the card is measured at, named for the situation each stands for. */
const OVERVIEW_WIDTHS = [
  { name: 'narrow', px: 380 },
  { name: 'screenshot', px: 880 },
  { name: 'wide', px: 1200 },
] as const;

/** The open season the card is fed; the values are ordinary, not adversarial. */
const OVERVIEW: SeasonOverview = {
  title: 'Julio 2026',
  statusLabel: 'Open',
  statusColor: 'success',
  createdLabel: 'Jul 1, 2026',
  minApprovalGrade: 7,
  slots: 12,
};

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * How much taller than its own text the fact list, or the card than everything
 * in it stacked, may be. Row gaps and rounding only: a list sized by a 26rem
 * basis is hundreds of pixels past it.
 */
const STACKED_SLACK_PX = 32;

/**
 * The tallest the card may be when it has the room to lay out in one row.
 * Three one-line facts and a button need roughly 100px; the broken layout was
 * over 500px, so this has a wide margin on both sides.
 */
const WIDE_CARD_MAX_HEIGHT_PX = 180;

/** Attribute that marks each width wrapper so its card can be found. */
const WRAPPER_ATTRIBUTE = 'data-season-overview-fixture';

/** Measurements of one mounted card, read in one pass. */
interface CardParts {
  readonly card: Element;
  readonly facts: Element;
  readonly closeButton: Element;
  readonly terms: readonly Element[];
}

/** Finds the Close season button among the buttons of a card. */
function findCloseButton(card: Element): Element | undefined {
  return [...card.querySelectorAll('button')].find((button) => button.textContent === 'Close season');
}

/** Finds the card's parts inside one wrapper, or null when the card did not render. */
function findParts(wrapper: Element): CardParts | null {
  const card = wrapper.querySelector('[aria-label="Season"]');
  if (card === null) {
    return null;
  }
  const facts = card.querySelector('dl');
  const closeButton = findCloseButton(card);
  if (!facts || !closeButton) {
    return null;
  }
  return { card, facts, closeButton, terms: [...card.querySelectorAll('dt')] };
}

/**
 * The height of every label and value in a box stacked end to end -- the most a
 * content-sized fact list can need. Terms and values are measured rather than
 * the fact wrappers, because a stretched flex line stretches the wrappers too
 * and would make an oversized list look as tall as it needs to be.
 */
function stackedTextHeight(box: Element): number {
  return [...box.querySelectorAll('dt, dd')].reduce((total, text) => total + text.getBoundingClientRect().height, 0);
}

/** Whether a box lies fully inside another, within the overflow tolerance. */
function isInside(inner: Element, outer: Element): boolean {
  const innerBox = inner.getBoundingClientRect();
  const outerBox = outer.getBoundingClientRect();
  return (
    innerBox.width > 0 &&
    innerBox.left >= outerBox.left - OVERFLOW_TOLERANCE_PX &&
    innerBox.right <= outerBox.right + OVERFLOW_TOLERANCE_PX &&
    innerBox.bottom <= outerBox.bottom + OVERFLOW_TOLERANCE_PX
  );
}

/** The flex direction of the box holding the fact list: a column here is what stretched the card. */
function contentDirection(facts: Element): string {
  return globalThis.getComputedStyle(facts.parentElement ?? facts).flexDirection;
}

/** The height of the box holding the action, which is what the button adds to a stacked card. */
function actionsHeight(closeButton: Element): number {
  return closeButton.parentElement?.getBoundingClientRect().height ?? 0;
}

/** The card's own top padding, which a stacked card pays once above and once below. */
function cardPadding(card: Element): number {
  return Number.parseFloat(globalThis.getComputedStyle(card).paddingTop) || 0;
}

/** Checks the fact list and the card are no taller than their own content stacked, which is what a column-sized basis breaks. */
function measureCardHeight(name: string, px: number, { card, facts, closeButton }: CardParts): readonly Check[] {
  const cardHeight = card.getBoundingClientRect().height;
  const factsBox = facts.getBoundingClientRect();
  const stacked = stackedTextHeight(facts);
  const everythingStacked = stacked + actionsHeight(closeButton) + 2 * cardPadding(card);

  return [
    {
      name: `${name}: the fact list is no taller than its facts stacked`,
      ok: factsBox.height <= stacked + STACKED_SLACK_PX,
      detail: `fact list ${Math.round(factsBox.height)}px, facts stacked ${Math.round(stacked)}px, content flex-direction ${contentDirection(facts)} at ${px}px`,
    },
    {
      name: `${name}: the card is no taller than everything in it stacked`,
      ok: cardHeight <= everythingStacked + STACKED_SLACK_PX,
      detail: `card ${Math.round(cardHeight)}px, facts and actions stacked ${Math.round(everythingStacked)}px at ${px}px`,
    },
  ];
}

/** Checks all three facts and Close season sit inside the card, which does not spill sideways. */
function measureCardContainment(name: string, { card, closeButton, terms }: CardParts): readonly Check[] {
  const cardBox = card.getBoundingClientRect();

  return [
    {
      name: `${name}: all three facts and Close season stay inside the card`,
      ok: terms.length === 3 && [...terms, closeButton].every((part) => isInside(part, card)),
      detail: `${terms.length} fact(s), card ${Math.round(cardBox.width)}x${Math.round(cardBox.height)}px`,
    },
    {
      name: `${name}: the card does not overflow sideways`,
      ok: card.scrollWidth <= card.clientWidth + OVERFLOW_TOLERANCE_PX,
      detail: `scrollWidth ${card.scrollWidth}, clientWidth ${card.clientWidth}`,
    },
  ];
}

/** Measures the card at one width: content-sized, and everything inside it. */
function measureCard(name: string, px: number, wrapper: Element): readonly Check[] {
  const parts = findParts(wrapper);
  if (parts === null) {
    return [{ name: `${name}: the season card rendered its own parts`, ok: false, detail: `no card, fact list or Close season button at ${px}px` }];
  }
  return [...measureCardHeight(name, px, parts), ...measureCardContainment(name, parts)];
}

/** At widths with room for one row, the card stays compact and the facts sit beside the action. */
function measureOneRow(name: string, px: number, wrapper: Element): readonly Check[] {
  const parts = findParts(wrapper);
  if (parts === null) {
    return [];
  }
  const cardHeight = parts.card.getBoundingClientRect().height;
  const factsBox = parts.facts.getBoundingClientRect();
  const buttonBox = parts.closeButton.getBoundingClientRect();

  return [
    {
      name: `${name}: the card is compact`,
      ok: cardHeight <= WIDE_CARD_MAX_HEIGHT_PX,
      detail: `card ${Math.round(cardHeight)}px, limit ${WIDE_CARD_MAX_HEIGHT_PX}px at ${px}px`,
    },
    {
      name: `${name}: the facts and Close season share a row`,
      ok: buttonBox.left >= factsBox.right - OVERFLOW_TOLERANCE_PX && buttonBox.top < factsBox.bottom,
      detail: `facts right ${Math.round(factsBox.right)}, button left ${Math.round(buttonBox.left)}, button top ${Math.round(buttonBox.top)}, facts bottom ${Math.round(factsBox.bottom)}`,
    },
  ];
}

/** Measures every wrapper on the page, reporting a missing wrapper as a failure. */
function measureAll(): readonly Check[] {
  return OVERVIEW_WIDTHS.flatMap(({ name, px }) => {
    const wrapper = document.querySelector(`[${WRAPPER_ATTRIBUTE}="${name}"]`);
    if (wrapper === null) {
      return [{ name: `${name}: the wrapper rendered`, ok: false, detail: `no wrapper at ${px}px` }];
    }
    return [...measureCard(name, px, wrapper), ...(name === 'narrow' ? [] : measureOneRow(name, px, wrapper))];
  });
}

/**
 * Mounts the real Overview card at each width and measures it once the card is
 * on screen.
 */
export function SeasonOverviewFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(
    () =>
      measureWhenReady(
        () => document.querySelectorAll(`[${WRAPPER_ATTRIBUTE}] dl`).length === OVERVIEW_WIDTHS.length,
        () => setChecks(measureAll()),
      ),
    [],
  );

  return (
    <>
      {OVERVIEW_WIDTHS.map(({ name, px }) => (
        <div key={name} {...{ [WRAPPER_ATTRIBUTE]: name }} style={{ width: px }}>
          <SeasonOverviewCard overview={OVERVIEW} onCloseSeason={() => undefined} />
        </div>
      ))}
      <VerdictReport checks={checks} />
    </>
  );
}
