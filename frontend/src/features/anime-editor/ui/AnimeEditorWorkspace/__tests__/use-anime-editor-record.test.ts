import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import { isIntentionalEditorOutcome } from '../anime-editor-workspace.helpers';
import { useAnimeEditorRecord } from '../use-anime-editor-record';

function createSource(overrides: Partial<AnimeEditorRuntimeSource>): AnimeEditorRuntimeSource {
  return {
    getAnimes: vi.fn().mockResolvedValue([]),
    getAnimeEditorRecord: vi.fn(),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
    pickFile: vi.fn().mockResolvedValue(''),
    ...overrides,
  } as unknown as AnimeEditorRuntimeSource;
}

describe('editor record outcome policy', () => {
  it('clears drafts only for applied and no-op outcomes', () => {
    expect(isIntentionalEditorOutcome({ outcome: 'applied', message: 'ok' })).toBe(true);
    expect(isIntentionalEditorOutcome({ outcome: 'no_op', message: 'ok' })).toBe(true);
    expect(isIntentionalEditorOutcome({ outcome: 'conflict', message: 'stale' })).toBe(false);
    expect(isIntentionalEditorOutcome({ outcome: 'error', message: 'failed' })).toBe(false);
  });
});

describe('editor record folder picker', () => {
  it('applies the picked folder path to the draft', async () => {
    const source = createSource({ pickFolder: vi.fn().mockResolvedValue('D:/Anime/New Show') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickFolder(); });

    expect(source.pickFolder).toHaveBeenCalledWith('Select anime folder');
    expect(result.current.draft.folder).toBe('D:/Anime/New Show');
  });

  it('leaves the folder unchanged when the picker is cancelled', async () => {
    const source = createSource({ pickFolder: vi.fn().mockResolvedValue('') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickFolder(); });

    expect(result.current.draft.folder).toBe('');
  });
});

describe('editor record cover-image picker', () => {
  it('applies the picked image path and forces the on-disk cover source', async () => {
    const source = createSource({ pickFile: vi.fn().mockResolvedValue('D:/Anime/Show/cover.jpg') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickCoverFile(); });

    expect(source.pickFile).toHaveBeenCalledWith('Select cover image');
    expect(result.current.draft.coverPath).toBe('D:/Anime/Show/cover.jpg');
    expect(result.current.draft.coverType).toBe('image');
  });

  it('leaves the cover unchanged when the picker is cancelled', async () => {
    const source = createSource({ pickFile: vi.fn().mockResolvedValue('') });
    const { result } = renderHook(() => useAnimeEditorRecord({ source }));

    await act(async () => { await result.current.onPickCoverFile(); });

    expect(result.current.draft.coverPath).toBe('');
  });
});
