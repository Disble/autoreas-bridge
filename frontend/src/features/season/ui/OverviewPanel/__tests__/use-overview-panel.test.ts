import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../shared/contracts/season.types';
import { createSeasonDataSource, makeSeason, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import type { SeasonDataSource } from '../../../../../shared/season/season.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useOverviewPanel } from '../use-overview-panel';

/** Builds a created season anime row with the given grade and section. */
function createdRow(id: string, animeId: string, grade: number, section = 'Visto'): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created',
    availableEpisodes: 0,
    animeId,
    section,
    sectionOrder: 0,
    grade,
    gradeSource: grade >= 1 ? 'manual' : '',
    skipGrading: false,
    consideration: 'none',
  };
}

/**
 * Renders the Overview hook with the season module ready.
 * @param source The port the Overview reads through.
 * @returns The render result.
 */
function renderOverview(source: SeasonDataSource) {
  return renderHook(() => useOverviewPanel(source), { wrapper: seasonQueryWrapper().wrapper });
}

describe('useOverviewPanel', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('fetches both the season and its animes on mount', async () => {
    const source = createSeasonDataSource();
    renderOverview(source);

    await waitFor(() => {
      expect(source.readSeason).toHaveBeenCalledTimes(1);
      expect(source.readSeasonAnimes).toHaveBeenCalledTimes(1);
    });
  });

  it('reflects the loaded rows in the derived view model', async () => {
    const rows = [createdRow('a', 'anime-a', 5, 'Sin ver'), createdRow('b', 'anime-b', 0, 'Ver hoy')];
    const { result } = renderOverview(createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows) }));

    await waitFor(() => expect(result.current.kpi.createdCount).toBe(2));
    expect(result.current.pipeline).toEqual([{ stage: 'pipeline', 'Sin ver': 1, 'Ver hoy': 1, Visto: 0 }]);
    expect(result.current.selectionOutcome).toEqual([{ dim: 'outcome', Approved: 1, Rejected: 0, 'No grade': 1 }]);
  });

  it('derives the outcome funnel and its meta line from the season and its rows', async () => {
    const uncreated = { ...createdRow('c', '', 0), availability: 'pending' };
    const source = createSeasonDataSource({
      readSeason: vi.fn().mockResolvedValue(makeSeason({ createdAt: new Date(2026, 6, 8, 12).getTime() })),
      readSeasonAnimes: vi.fn().mockResolvedValue([createdRow('a', 'anime-a', 5), createdRow('b', 'anime-b', 0), uncreated]),
    });
    const { result } = renderOverview(source);

    await waitFor(() => expect(result.current.outcomeMeta).toBe('Created July 8, 2026 · Minimum approval grade 4 · 1 intake name never created'));
    expect(result.current.outcomeSteps.map((step) => step.value)).toEqual(['3', '2', '1', '1']);
  });

  it('counts no rows and the season slots while the rows are still loading', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason({ slots: 7 })), readSeasonAnimes: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const { result } = renderOverview(source);

    await waitFor(() => expect(result.current.kpi.slots).toBe(7));
    expect(result.current.outcomeSteps[0]?.value).toBe('0');
  });

  it('passes readOnly and errorMessage through from the store unchanged', async () => {
    const source = createSeasonDataSource();
    const { result } = renderOverview(source);

    await waitFor(() => expect(source.readSeasonAnimes).toHaveBeenCalled());
    expect(result.current.readOnly).toBe(false);
    expect(result.current.errorMessage).toBeUndefined();
  });

  it('clears an earlier banner once the season and its rows read again', async () => {
    setSeasonStoreState({ errorMessage: 'earlier failure' });
    const { result } = renderOverview(createSeasonDataSource());

    await waitFor(() => expect(result.current.errorMessage).toBeUndefined());
  });

  it.each([
    ['season', { readSeason: vi.fn().mockRejectedValue(new Error('season down')), readSeasonAnimes: vi.fn().mockReturnValue(new Promise(() => undefined)) }, 'season down'],
    ['rows', { readSeasonAnimes: vi.fn().mockRejectedValue(new Error('rows down')) }, 'rows down'],
  ])('shows a failed %s read on the banner', async (_name, overrides, banner) => {
    const { result } = renderOverview(createSeasonDataSource(overrides));

    await waitFor(() => expect(result.current.errorMessage).toBe(banner));
  });

  it('keeps showing the loaded rows when a later read fails', async () => {
    const readSeasonAnimes = vi.fn().mockResolvedValueOnce([createdRow('a', 'anime-a', 5)]).mockRejectedValue(new Error('rows down'));
    const source = createSeasonDataSource({ readSeasonAnimes });
    const { wrapper } = seasonQueryWrapper();
    const first = renderHook(() => useOverviewPanel(source), { wrapper });
    await waitFor(() => expect(first.result.current.kpi.createdCount).toBe(1));
    first.unmount();

    const { result } = renderHook(() => useOverviewPanel(source), { wrapper });

    await waitFor(() => expect(result.current.errorMessage).toBe('rows down'));
    expect(result.current.kpi.createdCount).toBe(1);
  });
});
