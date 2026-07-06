import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSnapshot, SeasonSource } from '../../../infrastructure/season-source';
import { resetSeasonStore, useSeasonStore } from '../season-store';

function makeSeason(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status: 'open',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function makeSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(makeSeason()),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    ...overrides,
  };
}

describe('useSeasonStore', () => {
  beforeEach(() => {
    resetSeasonStore();
  });

  it('refresh loads the active season', async () => {
    const source = makeSource();
    await useSeasonStore.getState().refresh(source);

    const state = useSeasonStore.getState();
    expect(state.season?.name).toBe('Julio 2026');
    expect(state.hasLoaded).toBe(true);
    expect(state.errorMessage).toBeUndefined();
  });

  it('refresh with no active season sets season to null', async () => {
    const source = makeSource({ getSeason: vi.fn().mockResolvedValue(null) });
    await useSeasonStore.getState().refresh(source);

    expect(useSeasonStore.getState().season).toBeNull();
    expect(useSeasonStore.getState().hasLoaded).toBe(true);
  });

  it('createSeason refreshes the snapshot on success', async () => {
    const source = makeSource();
    await useSeasonStore.getState().createSeason(source, 'Julio 2026');

    expect(source.createSeason).toHaveBeenCalledWith('Julio 2026');
    expect(source.getSeason).toHaveBeenCalled();
    expect(useSeasonStore.getState().season?.name).toBe('Julio 2026');
  });

  it('createSeason surfaces the error and leaves season null on failure', async () => {
    const source = makeSource({ createSeason: vi.fn().mockResolvedValue('a season is already open') });
    await useSeasonStore.getState().createSeason(source, 'Octubre 2026');

    expect(useSeasonStore.getState().season).toBeNull();
    expect(useSeasonStore.getState().errorMessage).toBe('a season is already open');
  });

  it('setMinApprovalGrade updates optimistically and keeps the value on success', async () => {
    const source = makeSource();
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().setMinApprovalGrade(source, 5);

    expect(source.setMinApprovalGrade).toHaveBeenCalledWith(5);
    expect(useSeasonStore.getState().season?.minApprovalGrade).toBe(5);
  });

  it('setMinApprovalGrade rolls back on failure', async () => {
    const source = makeSource({ setMinApprovalGrade: vi.fn().mockResolvedValue('min approval grade 9 out of range 1-6') });
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().setMinApprovalGrade(source, 9);

    expect(useSeasonStore.getState().season?.minApprovalGrade).toBe(4);
    expect(useSeasonStore.getState().errorMessage).toBe('min approval grade 9 out of range 1-6');
  });

  it('setSlots updates optimistically on success', async () => {
    const source = makeSource();
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().setSlots(source, 9);

    expect(source.setSlots).toHaveBeenCalledWith(9);
    expect(useSeasonStore.getState().season?.slots).toBe(9);
  });

  it('closeSeason clears the active season on success', async () => {
    const getSeason = vi
      .fn()
      .mockResolvedValueOnce(makeSeason())
      .mockResolvedValueOnce(null);
    const source = makeSource({ getSeason });
    await useSeasonStore.getState().refresh(source);

    await useSeasonStore.getState().closeSeason(source);

    expect(source.closeSeason).toHaveBeenCalled();
    expect(useSeasonStore.getState().season).toBeNull();
  });
});
