import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonOrderingSnapshot, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import type { SeasonCoverSource } from '../../SeasonCoverThumb/season-cover-thumb.types';
import { useOverviewLineup } from '../use-overview-lineup';

/** A recorded snapshot with one Lunes card for the given anime. */
function snapshotWith(animeId: string): SeasonOrderingSnapshot {
  return { recorded: true, rail: [], grid: [{ animeId, name: animeId, dia: 'Lunes', orden: 1, section: 'Visto', isNewcomer: false }] };
}

/** A cover port that answers every id with a placeholder. */
function coverSource(): SeasonCoverSource {
  return { getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }) };
}

describe('useOverviewLineup', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('reads the recorded lineup of the viewed season and asks for each anime’s cover', async () => {
    setSeasonStoreState({ viewSeasonId: 's1' });
    const getSeasonOrderingSnapshot = vi.fn().mockResolvedValue(snapshotWith('a'));
    const covers = coverSource();

    const source = { getSeasonOrderingSnapshot } as unknown as SeasonSource;
    const { result } = renderHook(() => useOverviewLineup(source, covers));

    expect(result.current.view.display).toBe('loading');
    await waitFor(() => expect(result.current.view.display).toBe('lineup'));
    expect(getSeasonOrderingSnapshot).toHaveBeenCalledWith('s1');
    expect(covers.getAnimeCover).toHaveBeenCalledWith('a');
  });

  it('reads nothing while no past season is viewed', () => {
    const getSeasonOrderingSnapshot = vi.fn().mockResolvedValue(snapshotWith('a'));

    const source = { getSeasonOrderingSnapshot } as unknown as SeasonSource;
    const covers = coverSource();
    renderHook(() => useOverviewLineup(source, covers));

    expect(getSeasonOrderingSnapshot).not.toHaveBeenCalled();
  });

  it('drops a read that settles after the viewed season changed', async () => {
    let settleFirst: (snapshot: SeasonOrderingSnapshot) => void = () => undefined;
    const getSeasonOrderingSnapshot = vi
      .fn()
      .mockImplementationOnce(() => new Promise<SeasonOrderingSnapshot>((resolve) => (settleFirst = resolve)))
      .mockResolvedValueOnce(snapshotWith('second'));
    setSeasonStoreState({ viewSeasonId: 's1' });
    const source = { getSeasonOrderingSnapshot } as unknown as SeasonSource;
    const covers = coverSource();
    const { result } = renderHook(() => useOverviewLineup(source, covers));

    act(() => setSeasonStoreState({ viewSeasonId: 's2' }));
    await waitFor(() => expect(result.current.view.days[0]?.items[0].animeId).toBe('second'));
    await act(async () => settleFirst(snapshotWith('first')));

    expect(result.current.view.days[0].items[0].animeId).toBe('second');
  });
});
