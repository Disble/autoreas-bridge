import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source';
import { resetSeasonStore } from '../../../../../shared/store/season-store';
import { useIntakePanel } from '../use-intake-panel';

function createSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([] as SeasonAnimeRow[]),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('useIntakePanel', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('refreshes the intake rows on mount', async () => {
    const source = createSource();
    renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(source.getSeasonAnimes).toHaveBeenCalled());
  });

  it('splits editable rows from created and counts unresolved', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', animeId: '', section: '' },
      { id: 'b', rawName: 'B', matchStatus: 'ambiguous', matchedSlug: '', candidates: [], availability: 'waiting', animeId: '', section: '' },
      { id: 'c', rawName: 'C', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', animeId: 'anime-c', section: 'Sin ver' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));

    await waitFor(() => expect(result.current.editableRows).toHaveLength(2));
    expect(result.current.createdRows).toHaveLength(1);
    expect(result.current.unresolvedCount).toBe(2);
  });

  it('switching to raw builds the draft from editable names and switching back flushes', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'Anime A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', animeId: '', section: '' },
      { id: 'b', rawName: 'Anime B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'created', animeId: 'anime-b', section: 'Sin ver' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));
    await waitFor(() => expect(result.current.editableRows).toHaveLength(1));

    await act(async () => {
      result.current.switchMode('raw');
    });
    expect(result.current.rawDraft).toBe('Anime A'); // created anime excluded

    await act(async () => {
      result.current.onRawChange('Anime A\nAnime C');
    });
    await act(async () => {
      result.current.switchMode('list');
    });
    expect(source.reconcileIntake).toHaveBeenCalledWith('Anime A\nAnime C');
  });

  it('onResolve and onDiscard delegate to the source', async () => {
    const source = createSource();
    const { result } = renderHook(() => useIntakePanel(source));
    await act(async () => {
      result.current.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });
    await act(async () => {
      result.current.onDiscard('sa-2');
    });
    expect(source.resolveMatch).toHaveBeenCalledWith('sa-1', 'https://jkanime.net/dr-stone/');
    expect(source.discardName).toHaveBeenCalledWith('sa-2');
  });
});
