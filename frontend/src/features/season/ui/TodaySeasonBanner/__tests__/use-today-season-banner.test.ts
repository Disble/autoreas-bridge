import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonQuerySource } from '../../../../../shared/contracts/season.types';
import { createSeasonDataSource, makeSeason, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { useDisplayedSeason } from '../../../../../shared/season/use-displayed-season';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useTodaySeasonBanner } from '../use-today-season-banner';

/**
 * Renders the banner hook next to the Season route's season read, which loads the shared cache.
 * @param source The port the Season route reads through.
 * @returns The banner hook's render result.
 */
function renderBesideSeasonRoute(source: SeasonQuerySource) {
  const { wrapper } = seasonQueryWrapper();
  renderHook(() => useDisplayedSeason({ refresh: 'mount', source }), { wrapper });
  return renderHook(() => useTodaySeasonBanner(source), { wrapper });
}

describe('useTodaySeasonBanner', () => {
  afterEach(() => resetSeasonStore());

  it('hides the banner before the Season route loaded the season, and never fetches it', async () => {
    const source = createSeasonDataSource();
    const { result } = renderHook(() => useTodaySeasonBanner(source), { wrapper: seasonQueryWrapper().wrapper });

    await waitFor(() => expect(result.current).toBe(false));
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('shows the banner while the season the Season route loaded is open', async () => {
    const { result } = renderBesideSeasonRoute(createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) }));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('hides the banner while a closed historical season is viewed read-only', async () => {
    setSeasonStoreState({ viewSeasonId: 'season-old', readOnly: true });
    const source = createSeasonDataSource({ readPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 'season-old', status: 'closed' })) });
    const { result } = renderBesideSeasonRoute(source);

    await waitFor(() => expect(source.readPastSeason).toHaveBeenCalledWith('season-old'));
    expect(result.current).toBe(false);
  });
});
