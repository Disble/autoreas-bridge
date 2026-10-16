import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { disconnectSeasonMatchingStore, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { createSource, seasonRow } from './intake-panel.test-support';
import { useIntakePanel } from '../use-intake-panel';

describe('useIntakePanel discarded rows', () => {
  afterEach(() => {
    disconnectSeasonMatchingStore();
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('keeps discarded rows apart, restores one, and returns to the active rows once none is left', async () => {
    const active = seasonRow({ id: 'a', rawName: 'A' });
    const discarded = seasonRow({ id: 'd', rawName: 'D', matchStatus: 'discarded', matchedSlug: 'https://jkanime.net/d/' });
    const getSeasonAnimes = vi.fn().mockResolvedValue([active, discarded]);
    const source = createSource({ getSeasonAnimes });
    const { result } = renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(result.current.discardedRows.map((row) => row.id)).toEqual(['d']));
    expect(result.current.editableRows.map((row) => row.id)).toEqual(['a']);

    act(() => {
      result.current.onViewChange('discarded');
    });
    expect(result.current.view).toBe('discarded');

    getSeasonAnimes.mockResolvedValue([active, { ...discarded, matchStatus: 'matched' }]);
    await act(async () => {
      result.current.onRestore('d');
    });

    expect(source.restoreName).toHaveBeenCalledExactlyOnceWith('d');
    await waitFor(() => expect(result.current.discardedRows).toEqual([]));
    expect(result.current.view).toBe('active');
  });
});
