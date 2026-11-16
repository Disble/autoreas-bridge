import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../store/season-store/season-store.helpers';
import { SEASON_ANIMES_ENSURE_BANNER, SEASON_REFRESH_BANNER } from '../season.constants';
import type { SeasonBannerPolicy, SeasonBannerSource } from '../season.types';
import { useSeasonBannerSync } from '../use-season-banner-sync';

/**
 * Mounts the banner sync over a query state a case advances with `rerender`.
 * @param initial The query state at mount.
 * @param policy The banner policy.
 * @returns The render result.
 */
function mountSync(initial: SeasonBannerSource, policy: SeasonBannerPolicy) {
  return renderHook((query: SeasonBannerSource) => useSeasonBannerSync(query, policy), { initialProps: initial });
}

/** A query that has neither succeeded nor failed yet. */
const FRESH: SeasonBannerSource = { dataUpdatedAt: 0, errorUpdatedAt: 0, error: null };

describe('useSeasonBannerSync', () => {
  afterEach(() => resetSeasonStore());

  it('shows a new failure message on the banner', () => {
    const { rerender } = mountSync(FRESH, SEASON_REFRESH_BANNER);

    rerender({ ...FRESH, errorUpdatedAt: 1, error: new Error('season is starting') });

    expect(getSeasonStoreState().errorMessage).toBe('season is starting');
  });

  it('shows the fixed text for an ensure read failure', () => {
    const { rerender } = mountSync(FRESH, SEASON_ANIMES_ENSURE_BANNER);

    rerender({ ...FRESH, errorUpdatedAt: 1, error: new Error('rows down') });

    expect(getSeasonStoreState().errorMessage).toBe('Failed to load intake rows');
  });

  it.each([
    ['clears the banner after a refresh read', SEASON_REFRESH_BANNER, undefined],
    ['keeps the banner after an ensure read', SEASON_ANIMES_ENSURE_BANNER, 'earlier failure'],
  ])('%s succeeds', (_name, policy, expected) => {
    setSeasonStoreState({ errorMessage: 'earlier failure' });
    const { rerender } = mountSync(FRESH, policy);

    rerender({ ...FRESH, dataUpdatedAt: 1 });

    expect(getSeasonStoreState().errorMessage).toBe(expected);
  });

  it('does not report outcomes the query already had at mount', () => {
    setSeasonStoreState({ errorMessage: 'earlier failure' });
    const { rerender } = mountSync({ dataUpdatedAt: 5, errorUpdatedAt: 4, error: new Error('old failure') }, SEASON_REFRESH_BANNER);

    rerender({ dataUpdatedAt: 5, errorUpdatedAt: 4, error: new Error('old failure') });

    expect(getSeasonStoreState().errorMessage).toBe('earlier failure');
  });
});
