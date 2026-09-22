import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RuntimeEventRow } from '../../../../../shared/store/network-store/network-store.types';
import { useNetworkPanelLoading } from '../use-network-panel-loading';

/** Builds one minimal merged-feed row, just enough to make the feed non-empty. */
function feedRow(): RuntimeEventRow {
  return { id: 'event-1', occurredAtMs: 0, domain: 'anime', level: 'info', message: 'syncing catalogue' };
}

describe('useNetworkPanelLoading', () => {
  it('starts as nothing-to-show and never updating on the first render with an empty feed', () => {
    // The raw in-flight flag starts `true` before any asynchronous edge settles,
    // so an empty rail renders the skeleton placeholder, never the updating hint.
    const { result } = renderHook(() => useNetworkPanelLoading({ feedRows: [] }));

    expect(result.current.hasNothingToShow).toBe(true);
    expect(result.current.isUpdating).toBe(false);
  });

  it('resolves as updating rather than nothing-to-show when rows are already on screen', () => {
    const { result } = renderHook(() => useNetworkPanelLoading({ feedRows: [feedRow()] }));

    expect(result.current.hasNothingToShow).toBe(false);
    expect(result.current.isUpdating).toBe(true);
  });
});
