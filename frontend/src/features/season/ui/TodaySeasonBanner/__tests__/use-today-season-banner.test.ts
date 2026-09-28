import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SeasonSnapshot } from '../../../../../infrastructure/season-source/season-source.types';
import {
  resetSeasonStore,
  setSeasonStoreState,
} from '../../../../../shared/store/season-store/season-store.helpers';
import { useTodaySeasonBanner } from '../use-today-season-banner';

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
 * a closed season from the Season page history. The history path itself is proven
 * in `shared/store/__tests__/season-store.test.ts`; this file pins what the Today
 * banner must read from it.
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

describe('useTodaySeasonBanner', () => {
  afterEach(() => {
    resetSeasonStore();
  });

  it('hides the banner when the store holds no season snapshot', () => {
    const { result } = renderHook(() => useTodaySeasonBanner());

    expect(result.current).toBe(false);
  });

  it('shows the banner while the loaded season is open', () => {
    setSeasonStoreState({ season: seasonSnapshot('open') });

    const { result } = renderHook(() => useTodaySeasonBanner());

    expect(result.current).toBe(true);
  });

  it('hides the banner while a closed historical season is loaded read-only', () => {
    viewClosedHistory();

    const { result } = renderHook(() => useTodaySeasonBanner());

    expect(result.current).toBe(false);
  });
});
