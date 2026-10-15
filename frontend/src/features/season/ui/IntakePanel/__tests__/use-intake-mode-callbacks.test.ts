import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { useIntakeEditorState } from '../use-intake-editor-state';
import { useIntakeModeCallbacks } from '../use-intake-mode-callbacks';
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
  it('opens raw by seeding the draft from the editable names without reconciling', async () => {
    const reconcileIntake = createReconcileSpy();
    const source = createSource();
    const { result } = renderModeCallbacks(source, twoRows(), reconcileIntake);

    await act(async () => {
      result.current.modes.switchMode('raw');
    });

    expect(result.current.editor.mode).toBe('raw');
    expect(result.current.editor.rawDraft).toBe('Anime A\nAnime B');
    expect(reconcileIntake).not.toHaveBeenCalled();
  });

  it('ignores a switch to the mode it already shows, keeping the edited draft', async () => {
    const reconcileIntake = createReconcileSpy();
    const source = createSource();
    const { result } = renderModeCallbacks(source, twoRows(), reconcileIntake);

    await act(async () => {
      result.current.modes.switchMode('raw');
    });
    await act(async () => {
      result.current.modes.onRawChange('Anime A\nMy Edit');
    });
    await act(async () => {
      result.current.modes.switchMode('raw');
    });

    expect(result.current.editor.rawDraft).toBe('Anime A\nMy Edit');
    expect(reconcileIntake).not.toHaveBeenCalled();
  });

  it('ignores a switch to list while already listing, without reconciling', async () => {
    const reconcileIntake = createReconcileSpy();
    const source = createSource();
    const { result } = renderModeCallbacks(source, twoRows(), reconcileIntake);

    await act(async () => {
      result.current.modes.switchMode('list');
    });

    expect(result.current.editor.mode).toBe('list');
    expect(reconcileIntake).not.toHaveBeenCalled();
  });

  it('returns to list by flushing the edited draft and keeps that draft', async () => {
    const reconcileIntake = createReconcileSpy();
    const source = createSource();
    const { result } = renderModeCallbacks(source, twoRows(), reconcileIntake);

    await act(async () => {
      result.current.modes.switchMode('raw');
    });
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
