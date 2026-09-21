import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventPage } from '../../../../../shared/contracts/runtime-event.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { NetworkPanel } from '../NetworkPanel';
import { createFakeSource, createPushableSource, eventPage, eventSummary, mockGeometry, record } from './network-panel.test-support';

/**
 * Row-height estimate the virtual window compensates by, in px. Mirrors
 * VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX as a literal on purpose: the expected
 * offset is an exact figure against the production prepended height, not
 * against a constant a refactor could repoint.
 */
const ROW_HEIGHT_PX = 36;

/**
 * This file used to pin the opposite behaviour: a `useLayoutEffect` forced
 * `scrollTop = scrollHeight` on every feed change, which kept the newest row in
 * view while the feed was OLDEST-first. `SearchRuntimeEvents` returns rows
 * NEWEST-first, so the same effect would now scroll to the oldest loaded row on
 * every push. Re-specified 2026-09-21 for the virtualized rail: a push is a
 * head insertion whose rows shift the whole content down by one row height, so
 * the rail compensates the scroll offset BY that height — the content the user
 * was reading moves WITH the offset and stays exactly where it was (at the very
 * top the arrivals ARE the content, so no compensation runs there).
 */
describe('NetworkPanel viewport stability (the overlay must not move the user)', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('compensates the offset by the prepended row height so a pushed event does not move what the user is reading', async () => {
    // Re-specified: this row used to pin the pre-virtualization DOM literal
    // (scrollTop unchanged after a push). The intent — a pushed event must not
    // move what the user is reading — is now expressed by the compensation:
    // away from the top, the offset becomes the previous offset plus the
    // prepended row height, because the content itself moved down by exactly
    // that height. A pushed row must never grow or shrink that figure.
    const { source, push } = createPushableSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { message: 'persisted event' })])),
    });
    const { container } = render(<NetworkPanel source={source} />);

    await screen.findByText('persisted event');

    const scroller = container.querySelector<HTMLElement>('[data-network-scroll]');
    expect(scroller).not.toBeNull();

    const geometry = mockGeometry(scroller as HTMLElement, 1_200, 400, 5_000);

    act(() => {
      push({ timestamp: new Date(200_000).toISOString(), domain: 'sync', level: 'info', message: 'pushed event' });
    });

    await screen.findByText('pushed event');

    expect(geometry.scrollTop).toBe(1_200 + ROW_HEIGHT_PX);
  });

  it('leaves the scroll position alone when the first persisted page lands', async () => {
    let resolvePage: ((value: RuntimeEventPage) => void) | undefined;
    const source = createFakeSource({
      searchEvents: vi.fn().mockImplementation(
        () =>
          new Promise<RuntimeEventPage>((resolve) => {
            resolvePage = resolve;
          }),
      ),
    });

    const { container } = render(<NetworkPanel source={source} />);

    const scroller = container.querySelector<HTMLElement>('[data-network-scroll]');
    const geometry = mockGeometry(scroller as HTMLElement, 640, 400, 5_000);

    await act(async () => {
      resolvePage?.(eventPage([record(1, { message: 'first page row' })]));
    });

    await waitFor(() => {
      expect(screen.getByText('first page row')).toBeInTheDocument();
    });

    expect(geometry.scrollTop).toBe(640);
  });
});
