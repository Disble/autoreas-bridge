import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSeasonDataSource, makeSeason, makeSeasonRow, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { useDisplayedSeason } from '../../../../../shared/season/use-displayed-season';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useOrderingBoardStoreBindings } from '../use-ordering-board-store-bindings';

/**
 * Renders the bindings next to a reader of the displayed season, every read through `source`.
 * @param source The port the reads and the close command go through.
 * @returns The render result.
 */
function renderBindings(source: ReturnType<typeof createSeasonDataSource>) {
  return renderHook(
    () => ({ bindings: useOrderingBoardStoreBindings(source), season: useDisplayedSeason({ refresh: 'mount', source }) }),
    { wrapper: seasonQueryWrapper().wrapper },
  );
}

describe('useOrderingBoardStoreBindings', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('loads the open season rows once and keeps the same empty list until they arrive', async () => {
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow()]) });
    const { result, rerender } = renderBindings(source);
    const before = result.current.bindings.seasonAnimes;
    rerender();

    expect(result.current.bindings.seasonAnimes).toBe(before);
    expect(before).toEqual([]);
    await waitFor(() => expect(result.current.bindings.seasonAnimes).toHaveLength(1));
    await act(() => expect(result.current.bindings.ensureAnimesLoaded()).resolves.toBeUndefined());
    expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('passes the store view state and banner through', () => {
    setSeasonStoreState({ readOnly: true, viewSeasonId: 'old', errorMessage: 'earlier failure' });
    const { result } = renderBindings(createSeasonDataSource());

    expect(result.current.bindings).toMatchObject({ readOnly: true, viewSeasonId: 'old', errorMessage: 'earlier failure' });
  });

  it('shows the fixed banner text when the rows fail to load', async () => {
    renderBindings(createSeasonDataSource({ readSeasonAnimes: vi.fn().mockRejectedValue(new Error('rows down')) }));

    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('Failed to load intake rows'));
  });

  it('closes the season through the command and reads the season again', async () => {
    const readSeason = vi.fn().mockResolvedValueOnce(makeSeason()).mockResolvedValue(null);
    const source = createSeasonDataSource({ readSeason });
    const { result } = renderBindings(source);
    await waitFor(() => expect(result.current.season.data).toEqual(makeSeason()));

    await act(() => result.current.bindings.closeSeason(source as never));

    expect(source.closeSeason).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.season.data).toBeNull());
  });
});
