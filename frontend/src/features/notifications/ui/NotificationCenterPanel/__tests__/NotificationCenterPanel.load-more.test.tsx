import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationCenterSource } from '../../../../../infrastructure/notification-center-source/notification-center-source.types';
import type { NotificationPage, NotificationRow } from '../../../../../shared/contracts/notification-center.types';
import { triggerIntersectionObservers } from '../../../../../test/setup';
import { NotificationCenterPanel } from '../NotificationCenterPanel';

afterEach(cleanup);

/**
 * Rows one page carries. Written as a literal rather than imported from
 * `use-notification-center-page`: asserting against the production constant
 * would pass no matter what it was changed to.
 */
const PAGE_SIZE = 25;

/** Builds one master-list row with a title the test can find by text. */
function buildRow(id: number): NotificationRow {
  return {
    id,
    createdAtMs: 1_700_000_000_000 + id,
    title: `Notification ${id}`,
    body: '',
    level: 'info',
    source: 'download',
    actionCount: 0,
  };
}

/** Builds one page envelope carrying `PAGE_SIZE` rows starting at `offset`, and the cursor that follows it. */
function buildPage(offset: number, nextCursor: string): NotificationPage {
  return {
    items: Array.from({ length: PAGE_SIZE }, (_unused, index) => buildRow(offset + index + 1)),
    nextCursor,
    appliedLimit: PAGE_SIZE,
    totalEver: 10_000,
    degraded: false,
  };
}

/**
 * Builds a source whose every page reports another one after it, so an
 * unattended load-more trigger pages until the test times out instead of
 * stopping at a fixture's last page. Every other notification fake resolves a
 * page WITHOUT a `nextCursor`, which is exactly why none of them ever
 * exercised paging at all -- the same hole that let the identical runaway ship
 * in the Transactions rail.
 */
function createEndlessSource() {
  let pagesServed = 0;
  const listNotifications = vi.fn((): Promise<NotificationPage> => {
    pagesServed += 1;

    return Promise.resolve(buildPage((pagesServed - 1) * PAGE_SIZE, `cursor-${pagesServed}`));
  });

  const source: NotificationCenterSource = {
    listNotifications,
    getNotification: vi.fn(),
    getUnreadCount: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
    executeAction: vi.fn(),
  };

  return { listNotifications, source };
}

/** Flushes several microtask passes, so a self-feeding fetch loop has room to compound before the assertion. */
async function settleAsyncPasses(passes = 5): Promise<void> {
  // Sequential by design: each pass lets the previous fetch's continuation run.
  for (let pass = 0; pass < passes; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Returns the master list's scroll container, failing loudly when the panel rendered none. */
function scroller(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-notification-scroll]');

  if (node === null) {
    throw new Error('the notification master list rendered no scroll container');
  }

  return node;
}

/** Counts the notification rows actually mounted, excluding the column header row. */
function countRenderedRows(): number {
  return document.querySelectorAll('[data-notification-scroll] [role="rowheader"]').length;
}

/**
 * Installs mocked scroll geometry on the container. jsdom implements no
 * layout and reports zero for all three metrics, which `isNearListBottom`
 * correctly reads as "already fully scrolled" -- so a test that wants a
 * viewport sitting ABOVE the end has to state the numbers itself.
 */
function mockScrollGeometry(node: HTMLElement, geometry: Readonly<Record<'clientHeight' | 'scrollHeight' | 'scrollTop', number>>): void {
  for (const [property, value] of Object.entries(geometry)) {
    Object.defineProperty(node, property, { configurable: true, get: () => value });
  }
}

/**
 * Mounts the master list against a source that NEVER runs out of pages, then
 * leaves it alone. The rail walks the whole notification table if anything
 * other than a deliberate user gesture can raise load-more.
 *
 * Honest limit: jsdom implements no layout, so an IntersectionObserver-driven
 * sentinel never reports an intersection here on its own, and the runaway
 * cannot be reproduced end to end in this environment. What IS testable is
 * exactly what these three guards assert -- that mounting fetches ONE page,
 * that a sentinel reporting itself visible fetches nothing because the rail
 * mounts no sentinel, and that a scroll near the bottom does fetch. Any
 * effect-, collection-, or sentinel-driven fetch reintroduced later trips one
 * of the three immediately.
 */
describe('NotificationCenterPanel load-more trigger', () => {
  it('fetches exactly one page on mount and never pages on its own, however many pages the backend offers', async () => {
    const { listNotifications, source } = createEndlessSource();

    render(<NotificationCenterPanel source={source} />);

    await screen.findByText('Notification 25');

    await settleAsyncPasses();

    expect(listNotifications).toHaveBeenCalledTimes(1);
    expect(countRenderedRows()).toBe(PAGE_SIZE);
  });

  it('does not fetch when a load-more sentinel reports itself visible, because the rail mounts none', async () => {
    const { listNotifications, source } = createEndlessSource();

    render(<NotificationCenterPanel source={source} />);

    await screen.findByText('Notification 25');

    act(() => {
      triggerIntersectionObservers(true);
    });

    await settleAsyncPasses();

    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it('fetches the next page on a scroll near the bottom, so the guards above cannot be met by breaking pagination', async () => {
    const { listNotifications, source } = createEndlessSource();

    render(<NotificationCenterPanel source={source} />);

    await screen.findByText('Notification 25');

    fireEvent.scroll(scroller());

    await waitFor(() => {
      expect(listNotifications).toHaveBeenCalledTimes(2);
    });

    expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-1' }));
    await screen.findByText('Notification 50');
  });

  it('does not fetch when the scroll lands far from the bottom, so the near-bottom gate is a real gate', async () => {
    const { listNotifications, source } = createEndlessSource();

    render(<NotificationCenterPanel source={source} />);

    await screen.findByText('Notification 25');

    // 4,400px of list still below the fold -- nowhere near the 240px
    // threshold `isNearListBottom` fetches at.
    mockScrollGeometry(scroller(), { clientHeight: 500, scrollHeight: 5_000, scrollTop: 100 });

    fireEvent.scroll(scroller());

    await settleAsyncPasses();

    expect(listNotifications).toHaveBeenCalledTimes(1);
  });
});
