import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonOrderingSnapshot, SeasonQuerySource, SeasonSource } from '../../../../../shared/contracts/season.types';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import type { SeasonCoverSource } from '../../SeasonCoverThumb/season-cover-thumb.types';
import { OVERVIEW_LINEUP_LOAD_ERROR } from '../overview-panel.constants';
import { useOverviewLineup } from '../use-overview-lineup';

/** A recorded snapshot with one Lunes card for the given anime. */
function snapshotWith(animeId: string): SeasonOrderingSnapshot {
  return { recorded: true, rail: [], grid: [{ animeId, name: animeId, dia: 'Lunes', orden: 1, section: 'Visto', isNewcomer: false }] };
}

/** A cover port that answers every id with a placeholder. */
function coverSource(): SeasonCoverSource {
  return { getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }) };
}

/** Renders the lineup hook over `source` with the season module ready. */
function renderLineup(source: Partial<SeasonSource>, covers: SeasonCoverSource = coverSource()) {
  const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
  return renderHook(() => useOverviewLineup(source as SeasonSource & SeasonQuerySource, covers), { wrapper });
}

describe('useOverviewLineup', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('reads the recorded lineup of the viewed season and asks for each anime’s cover', async () => {
    setSeasonStoreState({ viewSeasonId: 's1' });
    const fetchSeasonOrderingSnapshot = vi.fn().mockResolvedValue(snapshotWith('a'));
    const covers = coverSource();

    const { result } = renderLineup({ fetchSeasonOrderingSnapshot }, covers);

    expect(result.current.view.display).toBe('loading');
    await waitFor(() => expect(result.current.view.display).toBe('lineup'));
    expect(fetchSeasonOrderingSnapshot).toHaveBeenCalledWith('s1');
    expect(covers.getAnimeCover).toHaveBeenCalledWith('a');
  });

  it('keeps the render model’s identity across renders while the lineup is unchanged', async () => {
    setSeasonStoreState({ viewSeasonId: 's1' });
    const { result, rerender } = renderLineup({ fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(snapshotWith('a')) });
    await waitFor(() => expect(result.current.view.display).toBe('lineup'));
    const settled = result.current.view;

    rerender();

    expect(result.current.view).toBe(settled);
  });

  it('reads nothing while no past season is viewed', async () => {
    const fetchSeasonOrderingSnapshot = vi.fn().mockResolvedValue(snapshotWith('a'));

    const { result } = renderLineup({ fetchSeasonOrderingSnapshot });

    await act(() => Promise.resolve());
    expect(fetchSeasonOrderingSnapshot).not.toHaveBeenCalled();
    expect(result.current.view.display).toBe('loading');
  });

  it.each([
    ['a failed read', { fetchSeasonOrderingSnapshot: vi.fn().mockRejectedValue(new Error('read failed')) }, 'read failed'],
    ['a source that cannot read the snapshot', {}, OVERVIEW_LINEUP_LOAD_ERROR],
  ])('reports %s as a failure, never as an unrecorded lineup', async (_case, source, message) => {
    setSeasonStoreState({ viewSeasonId: 's1' });

    const { result } = renderLineup(source);

    await waitFor(() => expect(result.current.view).toMatchObject({ display: 'failed', errorMessage: message }));
  });

  it('drops a read that settles after the viewed season changed', async () => {
    let settleFirst: (snapshot: SeasonOrderingSnapshot) => void = () => undefined;
    const fetchSeasonOrderingSnapshot = vi
      .fn()
      .mockImplementationOnce(() => new Promise<SeasonOrderingSnapshot>((resolve) => (settleFirst = resolve)))
      .mockResolvedValueOnce(snapshotWith('second'));
    setSeasonStoreState({ viewSeasonId: 's1' });
    const { result } = renderLineup({ fetchSeasonOrderingSnapshot });
    await waitFor(() => expect(fetchSeasonOrderingSnapshot).toHaveBeenCalledWith('s1'));

    act(() => setSeasonStoreState({ viewSeasonId: 's2' }));
    await waitFor(() => expect(result.current.view.days[0]?.items[0].animeId).toBe('second'));
    await act(async () => settleFirst(snapshotWith('first')));

    expect(result.current.view.days[0].items[0].animeId).toBe('second');
  });
});
