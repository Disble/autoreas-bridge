import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SeasonSnapshot } from '../../../../infrastructure/season-source/season-source.types';
import {
  resetSeasonStore,
  setSeasonStoreState,
} from '../../../../shared/store/season-store/season-store.helpers';
import { useSeasonNavBadge } from '../use-season-nav-badge';

/** Builds the loaded season snapshot the shared store holds, with the status under test. */
function seasonSnapshot(status: string): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status,
    createdAt: 1_700_000_000_000,
  };
}

/**
 * Applies the read-model state `viewPastSeason` leaves behind once the user opens
 * a closed season from the Season page history, so the navigation badge is read
 * against real historical representation rather than an empty store.
 */
function viewClosedHistory(): void {
  setSeasonStoreState({
    season: seasonSnapshot('closed'),
    seasonAnimes: [],
    viewSeasonId: 'season-old',
    readOnly: true,
    hasLoaded: true,
    hasLoadedAnimes: true,
  });
}

describe('useSeasonNavBadge', () => {
  afterEach(() => {
    resetSeasonStore();
  });

  it('returns false when the store holds no season snapshot', () => {
    const { result } = renderHook(() => useSeasonNavBadge());

    expect(result.current).toBe(false);
  });

  it('returns true while the loaded season is open', () => {
    setSeasonStoreState({ season: seasonSnapshot('open') });

    const { result } = renderHook(() => useSeasonNavBadge());

    expect(result.current).toBe(true);
  });

  it('returns false while a closed historical season is loaded read-only', () => {
    viewClosedHistory();

    const { result } = renderHook(() => useSeasonNavBadge());

    expect(result.current).toBe(false);
  });
});
