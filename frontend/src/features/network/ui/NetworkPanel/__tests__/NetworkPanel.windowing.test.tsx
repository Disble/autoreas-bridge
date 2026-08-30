import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventQuery } from '../../../../../shared/contracts/runtime-event.types';
import { getNetworkStoreState, resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { NetworkPanel } from '../NetworkPanel';
import { createPushableSource, eventPage, mockGeometry, records } from './network-panel.test-support';

/** Counts the event rows actually mounted in the table body. */
function countRenderedRows(): number {
  return document.querySelectorAll('[data-network-scroll] tbody tr').length;
}

/** Reads the message cell of every mounted row, in render order. */
function renderedMessages(): readonly string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-network-scroll] tbody tr td:nth-child(4)')).map(
    (cell) => cell.textContent ?? '',
  );
}

/** Returns the rail's scroll container, failing loudly when the panel did not render one. */
function scroller(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-network-scroll]');

  if (node === null) {
    throw new Error('the Runtime Events rail rendered no scroll container');
  }

  return node;
}

describe('NetworkPanel progressive list (live rail)', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('renders exactly one batch on the first render, never the whole loaded page', async () => {
    const { source } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage(records(50), { nextCursor: 'cursor-1' })),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    // 20 is EVENT_PAGE_INITIAL_COUNT, written as a literal on purpose: asserting
    // against the production constant would pass no matter what it was changed to.
    expect(countRenderedRows()).toBe(20);
    expect(screen.getByText('50 entries')).toBeInTheDocument();
  });

  it('grows by one batch on scroll-near-bottom and unmounts nothing already rendered', async () => {
    const { source } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage(records(50), { nextCursor: 'cursor-1' })),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    const before = renderedMessages();

    fireEvent.scroll(scroller());

    await waitFor(() => {
      expect(countRenderedRows()).toBe(40);
    });

    expect(renderedMessages().slice(0, before.length)).toEqual(before);
  });

  it('appends the next cursor page below the existing rows without unmounting any of them', async () => {
    const searchEvents = vi
      .fn()
      .mockImplementation((query: RuntimeEventQuery) =>
        Promise.resolve(
          query.cursor === 'cursor-1'
            ? eventPage(records(10, 100))
            : eventPage(records(50), { nextCursor: 'cursor-1' }),
        ),
      );
    const { source } = createPushableSource({ searchEvents });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    const before = renderedMessages();

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(40);
    });

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(60);
    });

    expect(renderedMessages().slice(0, before.length)).toEqual(before);
    expect(renderedMessages()[59]).toBe('event 109');
    expect(searchEvents).toHaveBeenCalledTimes(2);
  });

  it('a pushed event grows the window by exactly one and disturbs nothing the user was reading', async () => {
    const { source, push } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage(records(50), { nextCursor: 'cursor-1' })),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    const geometry = mockGeometry(scroller(), 800, 400, 1_300);

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(40);
    });

    screen.getByText('event 5').closest('tr')?.click();
    await waitFor(() => {
      expect(getNetworkStoreState().selectedId).toBe('event-5');
    });

    const before = renderedMessages();

    act(() => {
      push({ timestamp: new Date(200_000).toISOString(), domain: 'api', level: 'info', message: 'pushed while reading' });
    });

    await waitFor(() => {
      expect(countRenderedRows()).toBe(41);
    });

    expect(renderedMessages()).toEqual(['pushed while reading', ...before]);
    expect(geometry.scrollTop).toBe(800);
    expect(getNetworkStoreState().selectedId).toBe('event-5');
    expect(getNetworkStoreState().domainFilter).toBe('all');
    expect(getNetworkStoreState().nextCursor).toBe('cursor-1');
  });

  it('stops requesting pages once the backend returned one carrying no continuation cursor', async () => {
    const searchEvents = vi.fn().mockResolvedValue(eventPage(records(50)));
    const { source } = createPushableSource({ searchEvents });

    render(<NetworkPanel source={source} />);

    await screen.findByText('event 0');

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(40);
    });

    fireEvent.scroll(scroller());
    await waitFor(() => {
      expect(countRenderedRows()).toBe(50);
    });

    fireEvent.scroll(scroller());

    expect(searchEvents).toHaveBeenCalledTimes(1);
  });
});
