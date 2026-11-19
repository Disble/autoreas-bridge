import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSeasonDataSource, makeSeasonRow, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import {
  disconnectSeasonMatchingStore,
  getSeasonStoreState,
  resetSeasonStore,
  setSeasonStoreState,
} from '../../../../../shared/store/season-store/season-store.helpers';
import type { IntakeMode } from '../intake-panel.types';
import { useIntakeEditorState } from '../use-intake-editor-state';
import { useIntakePanel } from '../use-intake-panel';
import { useIntakeQuery } from '../use-intake-query';
import { useIntakeStoreSlice } from '../use-intake-store-slice';
import { useIntakeView } from '../use-intake-view';
import { createSource, createSourceWithRows, seasonRow } from './intake-panel.test-support';
import type { SeasonSource } from '../../../../../shared/contracts/season.types';
import { INTAKE_RECONCILE_DEBOUNCE_MS } from '../intake-panel.constants';
import { useIntakeSyncEffects } from '../use-intake-sync-effects';

/**
 * The intake panel's sub-hooks, its sync effects and its discarded-row flow, in one DOM suite so
 * they share a single jsdom environment.
 */

/** The inputs a view case can change between renders. */
interface ViewProps {
  /** How many rows are discarded. */
  readonly count: number;
  /** The editing mode. */
  readonly mode: IntakeMode;
}

/**
 * Renders the view hook over a discarded-row count and a mode the case can change.
 * @param discardedCount The initial number of discarded rows.
 * @returns The hook harness.
 */
function renderView(discardedCount: number) {
  return renderHook(({ count, mode }: ViewProps) => useIntakeView(count, mode), { initialProps: { count: discardedCount, mode: 'list' } as ViewProps });
}

describe('useIntakeEditorState', () => {
  it('starts in list mode with empty editor state, then updates the mode and draft through its setters', () => {
    const { result } = renderHook(() => useIntakeEditorState());

    expect(result.current.mode).toBe('list');
    expect(result.current.rawDraft).toBe('');
    expect(result.current.selected.size).toBe(0);
    expect(result.current.folderOverrides).toEqual({});
    expect(result.current).not.toHaveProperty('libraryRoot');
    expect(result.current.metadataByRow).toEqual({});
    expect(result.current.appliedMetadataByRow).toEqual({});

    act(() => {
      result.current.setMode('raw');
    });
    act(() => {
      result.current.setRawDraft('Anime A');
    });

    expect(result.current.mode).toBe('raw');
    expect(result.current.rawDraft).toBe('Anime A');
  });
});

describe('useIntakeStoreSlice', () => {
  afterEach(() => resetSeasonStore());

  it('exposes query rows, store flags and messages, and every intake command', async () => {
    const rows = [seasonRow({ id: 'sa-1' })];
    setSeasonStoreState({ errorMessage: 'no active season', busyMessage: 'Checking episode availability…', matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' } });
    const source = createSourceWithRows(rows);
    const { result } = renderHook(() => useIntakeStoreSlice(source), { wrapper: seasonQueryWrapper().wrapper });
    for (const command of ['reconcileIntake', 'runMatching', 'resolveMatch', 'discardName', 'restoreName', 'setSeasonAnimeMetadata', 'createSeasonAnimes', 'recheckAvailability'] as const) {
      expect(result.current[command]).toBeTypeOf('function');
    }
    await waitFor(() => expect(result.current.seasonAnimes).toEqual(rows));
    expect(result.current.readOnly).toBe(false);
    expect(result.current.busyMessage).toBe('Checking episode availability…');
    expect(result.current.matchingRun).toEqual({ total: 2, resolvedInPhase: 1, phase: 'name_matching' });
  });
});

describe('useIntakeQuery', () => {
  afterEach(() => resetSeasonStore());

  it('supplies the panel with the query rows the screens read', async () => {
    const row = seasonRow({ id: 'query-row' });
    const source = { ...createSource(), ...createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([row]) }) };
    const { result } = renderHook(() => useIntakePanel(source), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.editableRows.map((item) => item.id)).toEqual(['query-row']));
  });

  it('keeps cached rows visible when a refetch fails', async () => {
    const row = makeSeasonRow();
    const readSeasonAnimes = vi.fn().mockResolvedValueOnce([row]).mockRejectedValue(new Error('read failed'));
    const { result } = renderHook(() => useIntakeQuery(createSeasonDataSource({ readSeasonAnimes })), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([row]));
    await act(() => result.current.refetch());
    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('read failed'));
    expect(result.current.view.kind).toBe('ready');
    expect(result.current.rows).toEqual([row]);
  });

  it('shows query rows with event progress rather than the store rows', async () => {
    const row = makeSeasonRow();
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([row]) });
    const { result } = renderHook(() => useIntakeQuery(source), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([row]));
    act(() => setSeasonStoreState({ matchingProgress: { [row.id]: { seasonId: 's', rowId: row.id, phase: 'name_matching', rawName: 'updated', matchStatus: 'matched', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0 } } }));
    expect(result.current.rows[0].rawName).toBe('updated');
  });
});

describe('useIntakeView', () => {
  it('starts on the active rows, switches to discarded, shows active in Raw mode and returns in List mode', () => {
    const { result, rerender } = renderView(2);
    expect(result.current.view).toBe('active');

    act(() => {
      result.current.onViewChange('discarded');
    });
    expect(result.current.view).toBe('discarded');

    // An unknown key is ignored.
    act(() => {
      result.current.onViewChange('raw');
    });
    expect(result.current.view).toBe('discarded');

    rerender({ count: 2, mode: 'raw' });
    expect(result.current.view).toBe('active');

    rerender({ count: 2, mode: 'list' });
    expect(result.current.view).toBe('discarded');
  });

  it('falls back to the active rows once the last discarded row is restored, and stays there', () => {
    const { result, rerender } = renderView(1);
    act(() => {
      result.current.onViewChange('discarded');
    });

    rerender({ count: 0, mode: 'list' });
    expect(result.current.view).toBe('active');

    rerender({ count: 1, mode: 'list' });
    expect(result.current.view).toBe('active');
  });
});

describe('useIntakePanel discarded rows', () => {
  afterEach(() => {
    disconnectSeasonMatchingStore();
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('keeps discarded rows apart, restores one, and returns to the active rows once none is left', async () => {
    const active = seasonRow({ id: 'a', rawName: 'A' });
    const discarded = seasonRow({ id: 'd', rawName: 'D', matchStatus: 'discarded', matchedSlug: 'https://jkanime.net/d/', metadata: { kind: 2, totalEpisodes: 12 } });
    const readSeasonAnimes = vi.fn().mockResolvedValue([active, discarded]);
    const source = createSource({ readSeasonAnimes });
    const { result } = renderHook(() => useIntakePanel(source), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.discardedRows.map((row) => row.id)).toEqual(['d']));
    expect(result.current.editableRows.map((row) => row.id)).toEqual(['a']);
    expect(Object.keys(result.current.discardedMetadataByRow)).toEqual(['d']);
    expect(result.current.discardedMetadataByRow.d).toMatchObject({ totalEpisodes: '12' });

    act(() => {
      result.current.onViewChange('discarded');
    });
    expect(result.current.view).toBe('discarded');

    readSeasonAnimes.mockResolvedValue([active, { ...discarded, matchStatus: 'matched' }]);
    await act(async () => {
      result.current.onRestore('d');
    });

    expect(source.restoreName).toHaveBeenCalledExactlyOnceWith('d');
    await waitFor(() => expect(result.current.discardedRows).toEqual([]));
    expect(result.current.view).toBe('active');
  });
});

/** The store actions the sync effects drive, as spies. */
interface SyncActionSpies {
  /** The mount-refresh spy. */
  readonly refreshAnimes: ReturnType<typeof vi.fn>;
  /** The debounced-reconcile spy. */
  readonly reconcileIntake: ReturnType<typeof vi.fn>;
}

/**
 * Builds the store-action spies the harness hands to the sync effects.
 * @returns Store-shaped spies resolving like the real actions.
 */
function createSyncSpies(): SyncActionSpies {
  return {
    refreshAnimes: vi.fn().mockResolvedValue(undefined),
    reconcileIntake: vi.fn().mockResolvedValue(undefined),
  };
}

/** Everything one sync-effects case renders the harness with. */
interface SyncHarnessProps {
  /** The season port the effects call into. */
  readonly source: SeasonSource;
  /** The store-action spies the slice exposes. */
  readonly spies: SyncActionSpies;
  /** Whether the panel reads a closed season: no live run may banner over it. */
  readonly readOnly?: boolean;
}

/**
 * Builds a season port whose matching subscriptions are spies, so a case can
 * assert the panel attached and released the live run.
 * @param overrides Per-test port replacements.
 * @returns A season port with matching subscription spies.
 */
function createMatchingSource(overrides: Partial<SeasonSource> = {}): SeasonSource {
  return createSource({
    subscribeMatchingStarted: vi.fn().mockReturnValue(() => undefined),
    subscribeMatchingProgress: vi.fn().mockReturnValue(() => undefined),
    subscribeMatchingFinished: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  });
}

/**
 * Renders the sync effects over a real editor state, exposing the editor so a
 * case can flip the mode and edit the draft like the panel does.
 * @param initial The source and spies to render with.
 * @returns The hook result for the case to drive.
 */
function renderSyncEffects(initial: SyncHarnessProps) {
  return renderHook(({ source, spies, readOnly }: SyncHarnessProps) => {
    const editor = useIntakeEditorState();
    const store = {
      readOnly: readOnly ?? false,
      refreshAnimes: spies.refreshAnimes,
      reconcileIntake: spies.reconcileIntake,
    } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    useIntakeSyncEffects({ editor, store, source });
    return { editor };
  }, { initialProps: initial });
}

/**
 * Builds the default harness props, so a case overrides only what it changes.
 * @param overrides Per-test prop replacements.
 * @returns Harness props with a fresh source and spies.
 */
function harnessProps(overrides: Partial<SyncHarnessProps> = {}): SyncHarnessProps {
  return {
    source: createSource(),
    spies: createSyncSpies(),
    ...overrides,
  };
}

describe('useIntakeSyncEffects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disconnectSeasonMatchingStore();
    resetSeasonStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leaves row reads to the query and never reconciles in list mode, even after a source change', async () => {
    const props = harnessProps();
    const nextSource = createSource();
    const { rerender } = renderSyncEffects(props);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTAKE_RECONCILE_DEBOUNCE_MS * 2);
    });
    expect(props.spies.refreshAnimes).not.toHaveBeenCalled();
    expect(props.spies.reconcileIntake).not.toHaveBeenCalled();

    // The legacy store refresh stays unused when the source changes.
    rerender({ ...props, source: nextSource });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(props.spies.refreshAnimes).not.toHaveBeenCalled();
  });

  it('never subscribes the live run while reading a closed season, and subscribes after leaving it', () => {
    const source = createMatchingSource();
    const props = harnessProps({ source, readOnly: true });
    const { rerender } = renderSyncEffects(props);

    expect(source.subscribeMatchingStarted).not.toHaveBeenCalled();
    expect(source.subscribeMatchingProgress).not.toHaveBeenCalled();
    expect(source.subscribeMatchingFinished).not.toHaveBeenCalled();

    rerender({ ...props, readOnly: false });

    expect(source.subscribeMatchingStarted).toHaveBeenCalledTimes(1);
  });

  it('subscribes the live run on mount, then drops it and the ephemeral run on unmount', () => {
    const startedUnsubscribe = vi.fn();
    const progressUnsubscribe = vi.fn();
    const finishedUnsubscribe = vi.fn();
    const source = createMatchingSource({
      subscribeMatchingStarted: vi.fn().mockReturnValue(startedUnsubscribe),
      subscribeMatchingProgress: vi.fn().mockReturnValue(progressUnsubscribe),
      subscribeMatchingFinished: vi.fn().mockReturnValue(finishedUnsubscribe),
    });
    const { unmount } = renderSyncEffects(harnessProps({ source }));
    expect(source.subscribeMatchingStarted).toHaveBeenCalledTimes(1);
    expect(source.subscribeMatchingProgress).toHaveBeenCalledTimes(1);
    expect(source.subscribeMatchingFinished).toHaveBeenCalledTimes(1);
    setSeasonStoreState({ matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' } });

    unmount();

    expect(startedUnsubscribe).toHaveBeenCalledTimes(1);
    expect(progressUnsubscribe).toHaveBeenCalledTimes(1);
    expect(finishedUnsubscribe).toHaveBeenCalledTimes(1);
    expect(getSeasonStoreState().matchingRun).toBeNull();
  });

  it('restarts the debounce with the latest draft on every keystroke', async () => {
    const props = harnessProps();
    const { result } = renderSyncEffects(props);

    act(() => {
      result.current.editor.setMode('raw');
    });
    act(() => {
      result.current.editor.setRawDraft('Anime A');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTAKE_RECONCILE_DEBOUNCE_MS - 100);
    });
    act(() => {
      result.current.editor.setRawDraft('Anime A\nAnime C');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTAKE_RECONCILE_DEBOUNCE_MS);
    });

    expect(props.spies.reconcileIntake).toHaveBeenCalledTimes(1);
    expect(props.spies.reconcileIntake).toHaveBeenLastCalledWith(props.source, 'Anime A\nAnime C');
  });
});
