import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeasonOrderingSnapshot, SeasonSource } from '../../contracts/season.types';
import { createModulesTestWrapper } from '../../query/test-support/bridge-modules.test-support';
import { useSeasonOrderingSnapshot } from '../use-season-ordering-snapshot';

/** The port slice the hook reads through. */
type SnapshotReader = Pick<SeasonSource, 'fetchSeasonOrderingSnapshot'>;

/** A recorded closure snapshot whose grid names the season it belongs to. */
function storedSnapshot(seasonId: string): SeasonOrderingSnapshot {
  return { recorded: true, rail: [], grid: [{ animeId: seasonId, name: seasonId, dia: 'Lunes', orden: 0, section: '', isNewcomer: false }] };
}

/** Renders the hook with the season module ready, starting on `seasonId`. */
function renderSnapshot(source: SnapshotReader, seasonId: string | null) {
  const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
  return renderHook(({ id }) => useSeasonOrderingSnapshot(id, source), { wrapper, initialProps: { id: seasonId } });
}

describe('useSeasonOrderingSnapshot', () => {
  it.each<[string, string | null, SnapshotReader]>([
    ['no closed season is viewed', null, { fetchSeasonOrderingSnapshot: vi.fn() }],
    ['the source cannot read the snapshot', 's1', {}],
  ])('stays loading and reads nothing when %s', async (_case, seasonId, source) => {
    const { result } = renderSnapshot(source, seasonId);

    await new Promise((resolve) => { setTimeout(resolve, 20); });

    expect(result.current).toEqual({ kind: 'loading' });
    expect(source.fetchSeasonOrderingSnapshot ?? vi.fn()).not.toHaveBeenCalled();
  });

  it('answers the viewed season’s stored snapshot, keeping its identity while the read is unchanged', async () => {
    const source = { fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot('s1')) };
    const { result, rerender } = renderSnapshot(source, 's1');

    await waitFor(() => expect(result.current).toEqual({ kind: 'ready', data: storedSnapshot('s1'), isRefreshing: false }));
    expect(source.fetchSeasonOrderingSnapshot).toHaveBeenCalledWith('s1');
    const settled = result.current;

    rerender({ id: 's1' });

    expect(result.current).toBe(settled);
  });

  it('reports a rejected read as a failure carrying its message', async () => {
    const source = { fetchSeasonOrderingSnapshot: vi.fn().mockRejectedValue(new Error('read failed')) };
    const { result } = renderSnapshot(source, 's1');

    await waitFor(() => expect(result.current).toMatchObject({ kind: 'failure', message: 'read failed' }));
  });

  it('never shows the previous season’s snapshot while the next season’s read runs', async () => {
    let resolveNext: (snapshot: SeasonOrderingSnapshot) => void = () => undefined;
    const fetchSeasonOrderingSnapshot = vi
      .fn()
      .mockResolvedValueOnce(storedSnapshot('s1'))
      .mockImplementationOnce(() => new Promise<SeasonOrderingSnapshot>((resolve) => { resolveNext = resolve; }));
    const { result, rerender } = renderSnapshot({ fetchSeasonOrderingSnapshot }, 's1');
    await waitFor(() => expect(result.current.kind).toBe('ready'));

    rerender({ id: 's2' });

    await waitFor(() => expect(fetchSeasonOrderingSnapshot).toHaveBeenLastCalledWith('s2'));
    expect(result.current).toEqual({ kind: 'loading' });
    resolveNext(storedSnapshot('s2'));
    await waitFor(() => expect(result.current).toEqual({ kind: 'ready', data: storedSnapshot('s2'), isRefreshing: false }));
  });

  it('waits for the season module before reading', async () => {
    const source = { fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot('s1')) };
    const { wrapper, emit } = createModulesTestWrapper({ module: 'season', state: 'starting' });
    const { result } = renderHook(() => useSeasonOrderingSnapshot('s1', source), { wrapper });

    await new Promise((resolve) => { setTimeout(resolve, 20); });
    expect(source.fetchSeasonOrderingSnapshot).not.toHaveBeenCalled();
    expect(result.current).toEqual({ kind: 'loading' });

    emit({ module: 'season', state: 'ready' });

    await waitFor(() => expect(result.current.kind).toBe('ready'));
  });

  it('serves every reader of one season from a single read', async () => {
    const source = { fetchSeasonOrderingSnapshot: vi.fn().mockResolvedValue(storedSnapshot('s1')) };
    const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
    const { result } = renderHook(() => [useSeasonOrderingSnapshot('s1', source), useSeasonOrderingSnapshot('s1', source)], { wrapper });

    await waitFor(() => expect(result.current.map((view) => view.kind)).toEqual(['ready', 'ready']));
    expect(source.fetchSeasonOrderingSnapshot).toHaveBeenCalledTimes(1);
  });
});
