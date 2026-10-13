import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { useIntakeCreationCallbacks } from '../use-intake-creation-callbacks';
import { useIntakeEditorState } from '../use-intake-editor-state';
import type { useIntakeMetadataView } from '../use-intake-metadata-view';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';
import { createSource } from './intake-panel.test-support';

/** The creation action the harness observes, resolving like the real store. */
type CreateSeasonAnimes = ReturnType<typeof useIntakeStoreSlice>['createSeasonAnimes'];

/**
 * Builds a creation-action spy the harness hands to the callbacks.
 * @returns A store-shaped creation spy resolving like the real action.
 */
function createCreateSpy(): CreateSeasonAnimes {
  return vi.fn().mockResolvedValue('ok') as unknown as CreateSeasonAnimes;
}

/**
 * Renders the creation callbacks over a real editor state, so each case drives
 * selection and overrides exactly like the panel does.
 * @param source The season port the callbacks call into.
 * @param createSeasonAnimes The creation-action spy the store slice exposes.
 * @returns The hook result plus the collaborators the case asserts on.
 */
function renderCreationCallbacks(source: SeasonSource, createSeasonAnimes: CreateSeasonAnimes) {
  return renderHook(({ currentSource }: { readonly currentSource: SeasonSource }) => {
    const editor = useIntakeEditorState();
    const metadata = { heldByRow: {} } as unknown as ReturnType<typeof useIntakeMetadataView>;
    const store = { createSeasonAnimes } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    const callbacks = useIntakeCreationCallbacks({ editor, metadata, store, source: currentSource });
    return { editor, callbacks };
  }, { initialProps: { currentSource: source } });
}

describe('useIntakeCreationCallbacks', () => {
  it('creates nothing while nothing is selected', async () => {
    const createSeasonAnimes = createCreateSpy();
    const source = createSource();
    const { result } = renderCreationCallbacks(source, createSeasonAnimes);

    await act(async () => {
      result.current.callbacks.onCreate();
    });

    expect(createSeasonAnimes).not.toHaveBeenCalled();
  });

  it('creates the selected rows with their overrides and clears the selection', async () => {
    const createSeasonAnimes = createCreateSpy();
    const source = createSource();
    const { result } = renderCreationCallbacks(source, createSeasonAnimes);

    act(() => {
      result.current.editor.setSelected(new Set(['sa-1', 'sa-2']));
    });
    act(() => {
      result.current.editor.setFolderOverrides({ 'sa-2': 'E:/Custom/Naruto S2' });
    });
    await act(async () => {
      result.current.callbacks.onCreate();
    });

    expect(createSeasonAnimes).toHaveBeenCalledWith(
      source,
      ['sa-1', 'sa-2'],
      { 'sa-2': 'E:/Custom/Naruto S2' },
      {},
    );
    expect(result.current.editor.selected.size).toBe(0);
  });

  it('picks the folder through the current source after it changes', async () => {
    const createSeasonAnimes = createCreateSpy();
    const firstSource = createSource({ pickFolder: vi.fn().mockResolvedValue('E:/First') });
    const nextSource = createSource({ pickFolder: vi.fn().mockResolvedValue('E:/Next') });
    const { result, rerender } = renderCreationCallbacks(firstSource, createSeasonAnimes);

    rerender({ currentSource: nextSource });
    await act(async () => {
      result.current.callbacks.onPickFolder('sa-1');
    });

    expect(nextSource.pickFolder).toHaveBeenCalled();
    expect(firstSource.pickFolder).not.toHaveBeenCalled();
    expect(result.current.editor.folderOverrides['sa-1']).toBe('E:/Next');
  });

  it('creates through the current source after it changes', async () => {
    const createSeasonAnimes = createCreateSpy();
    const firstSource = createSource();
    const nextSource = createSource();
    const { result, rerender } = renderCreationCallbacks(firstSource, createSeasonAnimes);

    rerender({ currentSource: nextSource });
    act(() => {
      result.current.editor.setSelected(new Set(['sa-1']));
    });
    await act(async () => {
      result.current.callbacks.onCreate();
    });

    expect(createSeasonAnimes).toHaveBeenCalledWith(nextSource, ['sa-1'], {}, {});
  });
});
