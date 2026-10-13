import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PreferencesSource } from '../../../../../infrastructure/preferences-source/preferences-source.types';
import type { SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
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
}

/**
 * Renders the sync effects over a real editor state, exposing the editor so a
 * case can flip the mode and edit the draft like the panel does.
 * @param initial The source, downloads-root source, and spies to render with.
 * @returns The hook result for the case to drive.
 */
function renderSyncEffects(initial: SyncHarnessProps) {
  return renderHook(({ source, downloadsRootSource, spies }: SyncHarnessProps) => {
    const editor = useIntakeEditorState();
    const store = {
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
