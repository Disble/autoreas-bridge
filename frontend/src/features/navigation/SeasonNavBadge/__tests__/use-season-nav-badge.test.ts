import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { createSeasonDataSource, makeSeason, seasonQueryWrapper } from '../../../../shared/season/__tests__/season.test-support';
import { useDisplayedSeason } from '../../../../shared/season/use-displayed-season';
import { resetSeasonStore, setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import { useSeasonNavBadge } from '../use-season-nav-badge';

/**
 * Renders the badge hook next to the Season route's season read, which loads the shared cache.
 * @param source The port the Season route reads through.
 * @returns The badge hook's render result.
 */
function renderBesideSeasonRoute(source: SeasonQuerySource) {
  const { wrapper } = seasonQueryWrapper();
  renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), { wrapper });
  return renderHook(() => useSeasonNavBadge(source), { wrapper });
}

describe('useSeasonNavBadge', () => {
  afterEach(() => resetSeasonStore());

  it('hides the badge before the Season route loaded the season, and never fetches it', async () => {
    const source = createSeasonDataSource();
    const { result } = renderHook(() => useSeasonNavBadge(source), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(result.current).toBe(false));
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('shows the badge while the season the Season route loaded is open', async () => {
    const { result } = renderBesideSeasonRoute(createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) }));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('hides the badge while a closed historical season is viewed read-only', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const source = createSeasonDataSource({ readPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 'season-old', status: 'closed' })) });
    const { result } = renderBesideSeasonRoute(source);

    await waitFor(() => expect(source.readPastSeason).toHaveBeenCalledWith('season-old'));
    expect(result.current).toBe(false);
  });
});
