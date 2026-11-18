import { act, renderHook, waitFor } from '@testing-library/react';
import type { Key } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { createSeasonDataSource, makeSeason, makeSeasonRow, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import type { SeasonDataSource } from '../../../../../shared/season/season.types';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { SEASON_SECTION_TABS } from '../season-workspace.constants';
import type { SeasonSectionId } from '../season-workspace.types';
import { useSeasonWorkspace } from '../use-season-workspace';
import { useSeasonWorkspaceTab } from '../use-season-workspace-tab';

/**
 * Renders the workspace hook with the season module ready.
 * @param source The port the workspace reads and commands go through.
 * @returns The render result.
 */
function renderWorkspace(source: SeasonDataSource) {
  return renderHook(() => useSeasonWorkspace(source), { wrapper: seasonQueryWrapper().wrapper });
}

describe('useSeasonWorkspace', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('starts on overview and changes the active tab when selected', () => {
    const { result } = renderWorkspace(createSeasonDataSource());

    expect(result.current.activeTab).toBe('overview');
    act(() => result.current.selectTab('evaluation'));
    expect(result.current.activeTab).toBe('evaluation');
  });

  it('keeps the active tab when the selected key is not a declared tab', () => {
    const { result } = renderWorkspace(createSeasonDataSource());

    act(() => result.current.selectTab('evaluation'));
    act(() => result.current.selectTab('not-a-tab'));
    expect(result.current.activeTab).toBe('evaluation');
  });

  it('exposes the store banner and the read-only view flag', () => {
    setSeasonStoreState({ errorMessage: 'Season unavailable', readOnly: true });
    const { result } = renderWorkspace(createSeasonDataSource());

    expect(result.current.errorMessage).toBe('Season unavailable');
    expect(result.current.readOnly).toBe(true);
  });

  it('stays loading without a call while the season module starts', async () => {
    const source = createSeasonDataSource();
    const { result } = renderHook(() => useSeasonWorkspace(source), { wrapper: createModulesTestWrapper(status('season', 'starting')).wrapper });

    await act(async () => undefined);
    expect(result.current.isLoading).toBe(true);
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('reads on mount and exposes a null overview when no season is open', async () => {
    const source = createSeasonDataSource();
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(source.readSeason).toHaveBeenCalledTimes(1);
    expect(result.current.season).toBeNull();
    expect(result.current.overview).toBeNull();
  });

  it('builds the overview view model for an open season', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.overview).not.toBeNull());
    expect(result.current.overview?.title).toBe('Julio 2026');
    expect(result.current.overview?.statusLabel).toBe('Open');
    expect(result.current.overview?.minApprovalGrade).toBe(4);
  });

  it('stays loading while the season request is unresolved and requests no animes', () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    const { result } = renderWorkspace(source);

    expect(result.current.isLoading).toBe(true);
    expect(source.readSeasonAnimes).not.toHaveBeenCalled();
  });

  it('keeps loading until the open season animes resolve, requesting them once', async () => {
    let settle: (rows: []) => void = () => undefined;
    const readSeasonAnimes = vi.fn().mockReturnValue(new Promise<[]>((resolve) => (settle = resolve)));
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), readSeasonAnimes });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(readSeasonAnimes).toHaveBeenCalledTimes(1));
    expect(result.current.overview).not.toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => settle([]));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('stops loading and shows the fixed error when the open season animes fail', async () => {
    const readSeasonAnimes = vi.fn().mockRejectedValue(new Error('animes down'));
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), readSeasonAnimes });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.errorMessage).toBe('Failed to load intake rows'));
    expect(readSeasonAnimes).toHaveBeenCalledTimes(1);
  });

  it('shows a failed season read on the banner', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockRejectedValue(new Error('season down')) });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.errorMessage).toBe('season down'));
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    ['a closed season', { readSeason: vi.fn().mockResolvedValue(makeSeason({ status: 'closed' })) }],
    ['no season', {}],
  ])('requests no animes for %s', async (_name, overrides) => {
    const source = createSeasonDataSource(overrides);
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(source.readSeasonAnimes).not.toHaveBeenCalled();
  });

  it('lists the past seasons only while no season is open', async () => {
    const past = makeSeason({ id: 'old', name: 'Abril 2026', status: 'closed' });
    const idle = createSeasonDataSource({ readSeasons: vi.fn().mockResolvedValue([past]) });
    const open = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()), readSeasons: vi.fn().mockResolvedValue([past]) });

    const idleView = renderWorkspace(idle);
    const openView = renderWorkspace(open);

    await waitFor(() => expect(idleView.result.current.pastSeasonEntries.map((entry) => entry.name)).toEqual(['Abril 2026']));
    await waitFor(() => expect(openView.result.current.overview).not.toBeNull());
    expect(open.readSeasons).not.toHaveBeenCalled();
    expect(openView.result.current.pastSeasonEntries).toEqual([]);
  });

  it('shows a failed past-seasons read on the banner', async () => {
    const source = createSeasonDataSource({ readSeasons: vi.fn().mockRejectedValue(new Error('history down')) });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.errorMessage).toBe('history down'));
  });

  it('opens a past season read-only and returns to the live one', async () => {
    const past = makeSeason({ id: 'old', name: 'Abril 2026', status: 'closed' });
    const source = createSeasonDataSource({
      readSeasons: vi.fn().mockResolvedValue([past]),
      readPastSeason: vi.fn().mockResolvedValue(past),
      readPastSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow()]),
    });
    const { result } = renderWorkspace(source);
    await waitFor(() => expect(result.current.pastSeasonEntries).toHaveLength(1));

    act(() => result.current.onViewPastSeason('old'));
    await waitFor(() => expect(result.current.overview?.title).toBe('Abril 2026'));
    expect(result.current.readOnly).toBe(true);
    expect(source.readSeasonAnimes).not.toHaveBeenCalled();

    await act(async () => result.current.onExitPastSeason());
    await waitFor(() => expect(result.current.season).toBeNull());
    expect(result.current.readOnly).toBe(false);
    expect(getSeasonStoreState().viewSeasonId).toBeNull();
  });

  it('exposes a date-derived suggested name', () => {
    const { result } = renderWorkspace(createSeasonDataSource());
    expect(result.current.suggestedName).toMatch(/^[A-Za-zÁÉÍÓÚáéíóú]+ \d{4}$/);
  });

  it('onCreateSeason delegates to the source and reads the season again', async () => {
    const readSeason = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(makeSeason());
    const source = createSeasonDataSource({ readSeason });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.onCreateSeason('Julio 2026'));

    await waitFor(() => expect(source.createSeason).toHaveBeenCalledWith('Julio 2026'));
    await waitFor(() => expect(result.current.season?.name).toBe('Julio 2026'));
  });

  it('onCloseSeason delegates to the source', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const { result } = renderWorkspace(source);

    await waitFor(() => expect(result.current.overview).not.toBeNull());
    act(() => result.current.onCloseSeason());

    await waitFor(() => expect(source.closeSeason).toHaveBeenCalledTimes(1));
  });
});

describe('useSeasonWorkspaceTab', () => {
  it.each([
    ['evaluation', 'evaluation'],
    ['not-a-tab', 'overview'],
  ] as const)('selecting %s leaves the active tab at %s', (key, expected) => {
    const { result } = renderHook(() => useSeasonWorkspaceTab());

    expect(result.current.activeTab).toBe('overview');
    act(() => result.current.selectTab(key as Key));
    expect(result.current.activeTab).toBe(expected satisfies SeasonSectionId);
    expect(SEASON_SECTION_TABS.some((tab) => tab.id === result.current.activeTab)).toBe(true);
  });
});
