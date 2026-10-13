import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesSource } from '../../../../../infrastructure/preferences-source/preferences-source.types';
import type { SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { disconnectSeasonMatchingStore, getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { INTAKE_RECONCILE_DEBOUNCE_MS } from '../intake-panel.constants';
import { useIntakeEditorState } from '../use-intake-editor-state';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';
import { useIntakeSyncEffects } from '../use-intake-sync-effects';
import { createDownloadsRootSource, createSource } from './intake-panel.test-support';

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
  /** The port that supplies the configured downloads root. */
  readonly downloadsRootSource: Pick<PreferencesSource, 'getDownloadsRoot'>;
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
 * @param initial The source, downloads-root source, and spies to render with.
 * @returns The hook result for the case to drive.
 */
function renderSyncEffects(initial: SyncHarnessProps) {
  return renderHook(({ source, downloadsRootSource, spies, readOnly }: SyncHarnessProps) => {
    const editor = useIntakeEditorState();
    const store = {
      readOnly: readOnly ?? false,
      refreshAnimes: spies.refreshAnimes,
      reconcileIntake: spies.reconcileIntake,
    } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    useIntakeSyncEffects({ editor, store, source, downloadsRootSource });
    return { editor };
  }, { initialProps: initial });
}

/**
 * Builds the default harness props, so a case overrides only what it changes.
 * @param overrides Per-test prop replacements.
 * @returns Harness props with a fresh source, root source, and spies.
 */
function harnessProps(overrides: Partial<SyncHarnessProps> = {}): SyncHarnessProps {
  return {
    source: createSource(),
    downloadsRootSource: createDownloadsRootSource('D:/Anime'),
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

  it('refreshes the rows on mount and loads the configured downloads root', async () => {
    const props = harnessProps();
    const { result } = renderSyncEffects(props);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(props.spies.refreshAnimes).toHaveBeenCalledWith(props.source);
    expect(props.downloadsRootSource.getDownloadsRoot).toHaveBeenCalled();
    expect(result.current.editor.downloadsRoot).toBe('D:/Anime');
  });

  it('refreshes through the current source after it changes', async () => {
    const props = harnessProps();
    const nextSource = createSource();
    const { rerender } = renderSyncEffects(props);

    rerender({ ...props, source: nextSource });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(props.spies.refreshAnimes).toHaveBeenCalledWith(nextSource);
  });

  it('loads the root from the current preferences source after it changes', async () => {
    const props = harnessProps();
    const nextRootSource = createDownloadsRootSource('E:/Shows');
    const { result, rerender } = renderSyncEffects(props);

    rerender({ ...props, downloadsRootSource: nextRootSource });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(nextRootSource.getDownloadsRoot).toHaveBeenCalled();
    expect(result.current.editor.downloadsRoot).toBe('E:/Shows');
  });

  it('reconciles the edited draft after the debounce while in raw mode', async () => {
    const props = harnessProps();
    const { result } = renderSyncEffects(props);

    act(() => {
      result.current.editor.setMode('raw');
    });
    act(() => {
      result.current.editor.setRawDraft('Anime A\nAnime C');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTAKE_RECONCILE_DEBOUNCE_MS);
    });

    expect(props.spies.reconcileIntake).toHaveBeenCalledWith(props.source, 'Anime A\nAnime C');
  });

  it('never reconciles while in list mode', async () => {
    const props = harnessProps();
    renderSyncEffects(props);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTAKE_RECONCILE_DEBOUNCE_MS * 2);
    });

    expect(props.spies.reconcileIntake).not.toHaveBeenCalled();
  });

  it('subscribes the live matching run on mount through the current source', () => {
    const source = createMatchingSource();
    renderSyncEffects(harnessProps({ source }));

    expect(source.subscribeMatchingStarted).toHaveBeenCalledTimes(1);
    expect(source.subscribeMatchingProgress).toHaveBeenCalledTimes(1);
    expect(source.subscribeMatchingFinished).toHaveBeenCalledTimes(1);
  });

  it('never subscribes the live run while reading a closed season', () => {
    const source = createMatchingSource();
    renderSyncEffects(harnessProps({ source, readOnly: true }));

    expect(source.subscribeMatchingStarted).not.toHaveBeenCalled();
    expect(source.subscribeMatchingProgress).not.toHaveBeenCalled();
    expect(source.subscribeMatchingFinished).not.toHaveBeenCalled();
  });

  it('resubscribes the live run after leaving the read-only history view', () => {
    const source = createMatchingSource();
    const props = harnessProps({ source, readOnly: true });
    const { rerender } = renderSyncEffects(props);

    rerender({ ...props, readOnly: false });

    expect(source.subscribeMatchingStarted).toHaveBeenCalledTimes(1);
  });

  it('drops the subscription and the ephemeral run on unmount', () => {
    const startedUnsubscribe = vi.fn();
    const progressUnsubscribe = vi.fn();
    const finishedUnsubscribe = vi.fn();
    const source = createMatchingSource({
      subscribeMatchingStarted: vi.fn().mockReturnValue(startedUnsubscribe),
      subscribeMatchingProgress: vi.fn().mockReturnValue(progressUnsubscribe),
      subscribeMatchingFinished: vi.fn().mockReturnValue(finishedUnsubscribe),
    });
    const { unmount } = renderSyncEffects(harnessProps({ source }));
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
