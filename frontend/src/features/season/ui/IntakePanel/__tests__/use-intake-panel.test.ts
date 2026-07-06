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
    importIntake: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
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

  it('exposes rows and the unresolved count', async () => {
    const rows: SeasonAnimeRow[] = [
      { id: 'a', rawName: 'A', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', animeId: '' },
      { id: 'b', rawName: 'B', matchStatus: 'matched', matchedSlug: 'x', candidates: [], availability: 'waiting', animeId: '' },
    ];
    const source = createSource({ getSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const { result } = renderHook(() => useIntakePanel(source));

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.unresolvedCount).toBe(1);
  });

  it('onImport delegates to the source', async () => {
    const source = createSource();
    const { result } = renderHook(() => useIntakePanel(source));
    await act(async () => {
      result.current.onImport('Dr. Stone');
    });
    expect(source.importIntake).toHaveBeenCalledWith('Dr. Stone');
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
