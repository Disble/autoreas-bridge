import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventPage } from '../../../../../shared/contracts/runtime-event.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { NetworkPanel } from '../NetworkPanel';
import { createFakeSource, createPushableSource, eventPage, eventSummary, mockGeometry, record } from './network-panel.test-support';

/**
 * This file used to pin the opposite behaviour: a `useLayoutEffect` forced
 * `scrollTop = scrollHeight` on every feed change, which kept the newest row in
 * view while the feed was OLDEST-first. `SearchRuntimeEvents` returns rows
 * NEWEST-first, so the same effect would now scroll to the oldest loaded row on
 * every push and fight `isNearListBottom` for the load-more trigger (design
 * D-6.1). New rows arrive at the top, where the user already is — so the guard
 * is inverted rather than dropped: the viewport must not move on its own.
 */
describe('NetworkPanel viewport stability (the overlay must not move the user)', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('leaves the scroll position where the user left it when a live event is pushed', async () => {
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

    expect(geometry.scrollTop).toBe(1_200);
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
