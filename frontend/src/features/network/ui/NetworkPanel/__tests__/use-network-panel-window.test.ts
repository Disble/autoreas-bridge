import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeEventRow } from '../../../../../shared/store/network-store/network-store.types';
import { useNetworkPanelWindow } from '../use-network-panel-window';
import { scrollFarFromBottom, scrollNearBottom } from './network-panel.test-support';

/** Builds `count` newest-first persisted rows with distinct ids and descending timestamps. */
function page(count: number, offset = 0): readonly RuntimeEventRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `event-${offset + index}`,
    occurredAtMs: 10_000 - (offset + index),
    domain: 'sync',
    level: 'info',
    message: `event ${offset + index}`,
  }));
}

/** Builds one live-pushed overlay row, newer than every persisted row above. */
function overlayRow(id: string, occurredAtMs: number): RuntimeEventRow {
  return { id, occurredAtMs, domain: 'api', level: 'info', message: `pushed ${id}` };
}

describe('useNetworkPanelWindow', () => {
  it('renders exactly one batch on first render even when the page holds far more rows', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(50), overlay: [] }, selectedId: null, onReachEnd: vi.fn() }),
    );

    expect(result.current.visibleCount).toBe(20);
    expect(result.current.visibleRows).toHaveLength(20);
  });

  it('grows by one batch when the user scrolls near the bottom', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(50), overlay: [] }, selectedId: null, onReachEnd: vi.fn() }),
    );

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    expect(result.current.visibleCount).toBe(40);
  });

  it('leaves the window alone while the user is still far from the bottom', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(50), overlay: [] }, selectedId: null, onReachEnd: vi.fn() }),
    );

    act(() => {
      result.current.onScroll(scrollFarFromBottom());
    });

    expect(result.current.visibleCount).toBe(20);
  });

  it('asks for the next cursor page only once the growth would run past the loaded rows', () => {
    const onReachEnd = vi.fn();
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(50), overlay: [] }, selectedId: null, onReachEnd }),
    );

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    expect(onReachEnd).not.toHaveBeenCalled();

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    expect(onReachEnd).toHaveBeenCalledTimes(1);
    expect(result.current.visibleCount).toBe(50);
  });

  it('grows the window by exactly one when a live push enters at the head, so the bottom visible row is not dropped', () => {
    const persisted = page(50);
    const { result, rerender } = renderHook(
      (props: { readonly overlay: readonly RuntimeEventRow[] }) =>
        useNetworkPanelWindow({ feed: { page: persisted, overlay: props.overlay }, selectedId: null, onReachEnd: vi.fn() }),
      { initialProps: { overlay: [] as readonly RuntimeEventRow[] } },
    );

    act(() => {
      result.current.onScroll(scrollNearBottom());
    });

    const beforeIds = result.current.visibleRows.map((row) => row.id);
    expect(beforeIds).toHaveLength(40);

    rerender({ overlay: [overlayRow('overlay-1', 99_999)] });

    expect(result.current.visibleCount).toBe(41);
    expect(result.current.visibleRows.map((row) => row.id)).toEqual(['overlay-1', ...beforeIds]);
  });

  it('presents the overlay ahead of the persisted page without reordering either half', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({
        feed: { page: page(3), overlay: [overlayRow('overlay-2', 99_999), overlayRow('overlay-1', 99_998)] },
        selectedId: null,
        onReachEnd: vi.fn(),
      }),
    );

    expect(result.current.rows.map((row) => row.id)).toEqual(['overlay-2', 'overlay-1', 'event-0', 'event-1', 'event-2']);
  });

  it('keeps the selected row rendered even when it sits past the current window', () => {
    const { result } = renderHook(() =>
      useNetworkPanelWindow({ feed: { page: page(50), overlay: [] }, selectedId: 'event-29', onReachEnd: vi.fn() }),
    );

    expect(result.current.visibleCount).toBe(30);
  });

  it('keeps a fully revealed feed revealed when an older cursor page is appended', () => {
    const { result, rerender } = renderHook(
      (props: { readonly rows: readonly RuntimeEventRow[] }) =>
        useNetworkPanelWindow({ feed: { page: props.rows, overlay: [] }, selectedId: null, onReachEnd: vi.fn() }),
      { initialProps: { rows: page(20) } },
    );

    expect(result.current.visibleCount).toBe(20);

    rerender({ rows: [...page(20), ...page(20, 20)] });

    expect(result.current.visibleCount).toBe(40);
  });
});
