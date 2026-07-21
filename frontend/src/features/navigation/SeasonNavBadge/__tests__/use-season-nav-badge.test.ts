import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { seasonStore } from '../../../../shared/store/season-store/season-store.helpers';
import { useSeasonNavBadge } from '../use-season-nav-badge';

describe('useSeasonNavBadge', () => {
  it('returns false when no season is open', () => {
    seasonStore.setState({ season: null });

    const { result } = renderHook(() => useSeasonNavBadge());

    expect(result.current).toBe(false);
  });

  it('returns true when a season is open', () => {
    seasonStore.setState({ season: { id: 'season-1' } as never });

    const { result } = renderHook(() => useSeasonNavBadge());

    expect(result.current).toBe(true);
  });
});
