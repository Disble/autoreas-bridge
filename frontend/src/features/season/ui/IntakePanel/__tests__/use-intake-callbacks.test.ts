import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../shared/contracts/season.types';
import { useIntakeEditorState } from '../use-intake-editor-state';
import { useIntakeModeCallbacks } from '../use-intake-mode-callbacks';
import { useIntakeRowCallbacks } from '../use-intake-row-callbacks';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';
import { createSource, seasonRow } from './intake-panel.test-support';

/** The reconcile spy the harness observes. */
type ReconcileSpy = ReturnType<typeof useIntakeStoreSlice>['reconcileIntake'];

/**
 * Builds a reconcile spy resolving like the real store action.
 * @returns A store-shaped reconcile spy.
 */
function createReconcileSpy(): ReconcileSpy {
  return vi.fn().mockResolvedValue(undefined) as unknown as ReconcileSpy;
}

/**
 * Renders the mode callbacks over a real editor state and the given rows, so
 * each case drives the Raw/List switch exactly like the panel does.
 * @param source The season port the flush calls into.
 * @param rows The intake rows the draft is seeded from.
 * @param reconcileIntake The reconcile spy the store slice exposes.
 * @returns The hook result plus the collaborators the case asserts on.
 */
function renderModeCallbacks(source: SeasonSource, rows: readonly SeasonAnimeRow[], reconcileIntake: ReconcileSpy) {
  return renderHook(() => {
    const editor = useIntakeEditorState();
    const store = { seasonAnimes: rows, reconcileIntake } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    const modes = useIntakeModeCallbacks({ editor, store, source });
    return { editor, modes };
  });
}

/**
 * Builds the two-row intake list the draft cases seed from.
 * @returns One pending and one matched row with distinct names.
 */
function twoRows(): SeasonAnimeRow[] {
  return [seasonRow({ id: 'a', rawName: 'Anime A' }), seasonRow({ id: 'b', rawName: 'Anime B' })];
}

describe('useIntakeModeCallbacks', () => {
  it('ignores same-mode switches, seeds raw from the names, then flushes the edited draft back to list', async () => {
    const reconcileIntake = createReconcileSpy();
    const source = createSource();
    const { result } = renderModeCallbacks(source, twoRows(), reconcileIntake);

    // A switch to list while already listing is ignored, without reconciling.
    await act(async () => {
      result.current.modes.switchMode('list');
    });
    expect(result.current.editor.mode).toBe('list');
    expect(reconcileIntake).not.toHaveBeenCalled();

    // Opening raw seeds the draft from the editable names without reconciling.
    await act(async () => {
      result.current.modes.switchMode('raw');
    });
    expect(result.current.editor.mode).toBe('raw');
    expect(result.current.editor.rawDraft).toBe('Anime A\nAnime B');
    expect(reconcileIntake).not.toHaveBeenCalled();

    // A switch to the mode it already shows keeps the edited draft.
    await act(async () => {
      result.current.modes.onRawChange('Anime A\nMy Edit');
    });
    await act(async () => {
      result.current.modes.switchMode('raw');
    });
    expect(result.current.editor.rawDraft).toBe('Anime A\nMy Edit');
    expect(reconcileIntake).not.toHaveBeenCalled();

    // Returning to list flushes the edited draft and keeps it.
    await act(async () => {
      result.current.modes.onRawChange('Anime A\nAnime C');
    });
    await act(async () => {
      result.current.modes.switchMode('list');
    });
    expect(reconcileIntake).toHaveBeenCalledWith(source, 'Anime A\nAnime C');
    expect(result.current.editor.mode).toBe('list');
    expect(result.current.editor.rawDraft).toBe('Anime A\nAnime C');
  });

  it('replaces the draft on every raw change', () => {
    const reconcileIntake = createReconcileSpy();
    const { result } = renderModeCallbacks(createSource(), twoRows(), reconcileIntake);

    act(() => {
      result.current.modes.onRawChange('First');
    });
    act(() => {
      result.current.modes.onRawChange('Second');
    });

    expect(result.current.editor.rawDraft).toBe('Second');
    expect(reconcileIntake).not.toHaveBeenCalled();
  });
});

/** The store actions the row callbacks drive, as spies. */
interface RowActionSpies {
  /** The matching spy. */
  readonly runMatching: ReturnType<typeof vi.fn>;
  /** The availability spy. */
  readonly recheckAvailability: ReturnType<typeof vi.fn>;
  /** The resolve spy. */
  readonly resolveMatch: ReturnType<typeof vi.fn>;
  /** The discard spy. */
  readonly discardName: ReturnType<typeof vi.fn>;
  /** The restore spy. */
  readonly restoreName: ReturnType<typeof vi.fn>;
}

/**
 * Builds the store-action spies the harness hands to the row callbacks.
 * @returns Store-shaped spies resolving like the real actions.
 */
function createRowSpies(): RowActionSpies {
  return {
    runMatching: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue(true),
    restoreName: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Renders the row callbacks over a real editor state, so each case drives the
 * selection exactly like the panel does.
 * @param source The season port the actions call into.
 * @param spies The store-action spies the slice exposes.
 * @returns The hook result for the case to drive.
 */
function renderRowCallbacks(source: SeasonSource, spies: RowActionSpies) {
  return renderHook(({ currentSource }: { readonly currentSource: SeasonSource }) => {
    const editor = useIntakeEditorState();
    const store = {
      runMatching: spies.runMatching,
      recheckAvailability: spies.recheckAvailability,
      resolveMatch: spies.resolveMatch,
      discardName: spies.discardName,
      restoreName: spies.restoreName,
    } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    const callbacks = useIntakeRowCallbacks({ store, editor, source: currentSource });
    return { editor, callbacks };
  }, { initialProps: { currentSource: source } });
}

describe('useIntakeRowCallbacks', () => {
  it('flips a selection, then runs matching, rechecks, resolves and opens pages through the source', async () => {
    const spies = createRowSpies();
    const source = createSource({ openPage: vi.fn() });
    const { result } = renderRowCallbacks(source, spies);

    act(() => {
      result.current.callbacks.toggleSelect('sa-1');
    });
    expect(result.current.editor.selected.has('sa-1')).toBe(true);
    act(() => {
      result.current.callbacks.toggleSelect('sa-1');
    });
    expect(result.current.editor.selected.has('sa-1')).toBe(false);

    await act(async () => {
      result.current.callbacks.onRunMatching();
    });
    expect(spies.runMatching).toHaveBeenCalledWith(source);

    await act(async () => {
      result.current.callbacks.onRecheckAvailability();
    });
    expect(spies.recheckAvailability).toHaveBeenCalledWith(source);

    await act(async () => {
      result.current.callbacks.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });
    expect(spies.resolveMatch).toHaveBeenCalledWith(source, 'sa-1', 'https://jkanime.net/dr-stone/');

    // The matched page opens in the system browser.
    act(() => {
      result.current.callbacks.onOpenPage('https://jkanime.net/dr-stone/');
    });
    expect(source.openPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
  });

  it.each([
    { callback: 'onDiscard', action: 'discardName' },
    { callback: 'onRestore', action: 'restoreName' },
  ] as const)('$callback sends one row to $action', async ({ callback, action }) => {
    const spies = createRowSpies();
    const source = createSource();
    const { result } = renderRowCallbacks(source, spies);

    await act(async () => {
      result.current.callbacks[callback]('sa-2');
    });

    expect(spies[action]).toHaveBeenCalledExactlyOnceWith(source, 'sa-2');
  });

  it('drives every action through the current source after it changes', async () => {
    const spies = createRowSpies();
    const firstSource = createSource({ openPage: vi.fn() });
    const nextSource = createSource({ openPage: vi.fn() });
    const { result, rerender } = renderRowCallbacks(firstSource, spies);

    rerender({ currentSource: nextSource });
    await act(async () => {
      result.current.callbacks.onRunMatching();
    });
    await act(async () => {
      result.current.callbacks.onRecheckAvailability();
    });
    await act(async () => {
      result.current.callbacks.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });
    await act(async () => {
      result.current.callbacks.onDiscard('sa-2');
    });
    await act(async () => {
      result.current.callbacks.onRestore('sa-3');
    });
    act(() => {
      result.current.callbacks.onOpenPage('https://jkanime.net/dr-stone/');
    });

    expect(spies.runMatching).toHaveBeenCalledWith(nextSource);
    expect(spies.recheckAvailability).toHaveBeenCalledWith(nextSource);
    expect(spies.resolveMatch).toHaveBeenCalledWith(nextSource, 'sa-1', 'https://jkanime.net/dr-stone/');
    expect(spies.discardName).toHaveBeenCalledWith(nextSource, 'sa-2');
    expect(spies.restoreName).toHaveBeenCalledWith(nextSource, 'sa-3');
    expect(nextSource.openPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
    expect(firstSource.openPage).not.toHaveBeenCalled();
  });
});
