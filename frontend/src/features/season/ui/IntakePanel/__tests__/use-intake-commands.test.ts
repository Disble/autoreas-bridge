import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { seasonStore } from '../../../../../shared/store/season-store/season-store.store';
import { useIntakeCommands } from '../use-intake-commands';
import { createSource } from './intake-panel.test-support';

describe('useIntakeCommands', () => {
  afterEach(() => resetSeasonStore());

  it.each([
    ['reconcileIntake', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.reconcileIntake(s, 'raw')],
    ['resolveMatch', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.resolveMatch(s, 'row', 'url')],
    ['discardName', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.discardName(s, 'row')],
    ['restoreName', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.restoreName(s, 'row')],
    ['setSeasonAnimeMetadata', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.setSeasonAnimeMetadata(s, 'row', '{}')],
    ['createSeasonAnimes', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.createSeasonAnimes(s, ['row'], {}, {})],
    ['recheckAvailability', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.recheckAvailability(s)],
  ] as const)('runs and refreshes %s once', async (name, invoke) => {
    const source = createSource();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    await act(async () => { await invoke(result.current, source); });
    expect(source[name]).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes successful matching only when no run started', async () => {
    const source = createSource();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    await act(() => result.current.runMatching(source));
    expect(refetch).toHaveBeenCalledTimes(1);
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });
    await act(() => result.current.runMatching(source));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not refresh live rows if the user enters history while the command runs', async () => {
    let release: (value: string) => void = () => undefined;
    const source = createSource({ reconcileIntake: vi.fn().mockReturnValue(new Promise<string>((resolve) => { release = resolve; })) });
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    let pending: Promise<void>;
    await act(async () => { pending = result.current.reconcileIntake(source, 'raw'); await Promise.resolve(); });
    setSeasonStoreState({ viewSeasonId: 'past', readOnly: true });
    await act(async () => { release('ok'); await pending; });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('records discard after the refreshed rows settle', async () => {
    const source = createSource();
    let release: () => void = () => undefined;
    const refetch = vi.fn().mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    let pending: Promise<boolean>;
    await act(async () => { pending = result.current.discardName(source, 'row-1'); await Promise.resolve(); });
    expect(getSeasonStoreState().lastDiscard).toBeNull();
    await act(async () => { release(); await pending; });
    expect(getSeasonStoreState().lastDiscard).toMatchObject({ rowId: 'row-1', sequence: 1 });
  });

  it('drops the matching run and its progress on command failure without refreshing', async () => {
    const source = createSource({ runMatching: vi.fn().mockResolvedValue('failed') });
    const refetch = vi.fn();
    setSeasonStoreState({ matchingRun: { total: 1, resolvedInPhase: 0, phase: 'name_matching' } });
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    await act(() => result.current.runMatching(source));
    await waitFor(() => expect(getSeasonStoreState().matchingRun).toBeNull());
    expect(getSeasonStoreState().matchingProgress).toEqual({});
    expect(getSeasonStoreState().errorMessage).toBe('failed');
    expect(refetch).not.toHaveBeenCalled();
  });

  /**
   * Pins who may own the shared busy message: the matching run, the anime
   * creation and the availability recheck announce themselves while they run
   * and clear it once settled.
   */
  it.each([
    ['runMatching', 'Matching names against jkanime…', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.runMatching(s)],
    ['createSeasonAnimes', 'Creating animes…', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.createSeasonAnimes(s, ['row'], {}, {})],
    ['recheckAvailability', 'Checking episode availability…', (c: ReturnType<typeof useIntakeCommands>, s: ReturnType<typeof createSource>) => c.recheckAvailability(s)],
  ] as const)('announces %s on the shared busy message while it runs', async (method, message, call) => {
    let release: (value: never) => void = () => undefined;
    const source = createSource({ [method]: vi.fn().mockReturnValue(new Promise<never>((resolve) => { release = resolve; })) });
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });

    let running: Promise<void>;
    await act(async () => { running = call(result.current, source); await Promise.resolve(); });
    expect(getSeasonStoreState().busyMessage).toBe(message);
    await act(async () => { release('ok' as never); await running; });
    expect(getSeasonStoreState().busyMessage).toBeUndefined();
  });

  /** Pins that the short intake commands never claim the shared busy message. */
  it('leaves the busy message alone for the short intake commands', async () => {
    const source = createSource();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useIntakeCommands(refetch, []), { wrapper: seasonQueryWrapper().wrapper });
    const seen: (string | undefined)[] = [];
    const stop = seasonStore.subscribe((state, previous) => { if (state.busyMessage !== previous.busyMessage) seen.push(state.busyMessage); });

    await act(async () => {
      await result.current.reconcileIntake(source, 'raw');
      await result.current.resolveMatch(source, 'row', 'url');
      await result.current.discardName(source, 'row');
      await result.current.restoreName(source, 'row');
      await result.current.setSeasonAnimeMetadata(source, 'row', '{}');
    });
    stop();
    expect(seen).toEqual([]);
  });
});
