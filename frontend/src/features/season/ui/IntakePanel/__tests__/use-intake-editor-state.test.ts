import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useIntakeEditorState } from '../use-intake-editor-state';

describe('useIntakeEditorState', () => {
  it('starts in list mode with an empty draft, selection, overrides, root, and metadata', () => {
    const { result } = renderHook(() => useIntakeEditorState());

    expect(result.current.mode).toBe('list');
    expect(result.current.rawDraft).toBe('');
    expect(result.current.selected.size).toBe(0);
    expect(result.current.folderOverrides).toEqual({});
    expect(result.current.libraryRoot).toBe('');
    expect(result.current.metadataByRow).toEqual({});
    expect(result.current.appliedMetadataByRow).toEqual({});
  });

  it('updates the mode and draft through its setters', () => {
    const { result } = renderHook(() => useIntakeEditorState());

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
