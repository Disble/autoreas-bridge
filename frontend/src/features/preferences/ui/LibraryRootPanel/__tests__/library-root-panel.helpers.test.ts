import { describe, expect, it } from 'vitest';
import {
  libraryRootChangeConfirmLabel,
  libraryRootChangeSummary,
  libraryRootPreviewOutcome,
  toPendingLibraryRootChange,
} from '../library-root-panel.helpers';

/** A served preview with one move and one kept anime. */
const PREVIEW = {
  oldRoot: 'D:\\Anime',
  moves: [{ animeId: 'y', name: 'Yani Neko', from: 'D:\\Anime\\Yani Neko', to: 'F:\\Anime\\Yani Neko', baseModifiedAt: 1 }],
  kept: [{ animeId: 'e', name: 'Eureka', folder: 'E:\\Anime\\Eureka' }],
};

describe('toPendingLibraryRootChange', () => {
  it('asks for confirmation only when an active anime moves', () => {
    expect(toPendingLibraryRootChange(PREVIEW, 'F:\\Anime')).toEqual({
      oldRoot: 'D:\\Anime',
      newRoot: 'F:\\Anime',
      moves: PREVIEW.moves,
      kept: PREVIEW.kept,
    });
    expect(toPendingLibraryRootChange({ ...PREVIEW, moves: [] }, 'F:\\Anime')).toBeNull();
  });
});

describe('libraryRootPreviewOutcome', () => {
  it('fails on a preview message, saves when nothing moves, and confirms otherwise', () => {
    expect(libraryRootPreviewOutcome({ ...PREVIEW, message: 'list animes: closed' }, 'F:\\Anime')).toEqual({
      kind: 'failed',
      message: 'list animes: closed',
    });
    expect(libraryRootPreviewOutcome({ ...PREVIEW, moves: [], message: '' }, 'F:\\Anime')).toEqual({ kind: 'save' });
    expect(libraryRootPreviewOutcome(PREVIEW, 'F:\\Anime')).toEqual({
      kind: 'confirm',
      pending: { oldRoot: 'D:\\Anime', newRoot: 'F:\\Anime', moves: PREVIEW.moves, kept: PREVIEW.kept },
    });
  });
});

describe('library root change copy', () => {
  it('counts the animes that move, in singular and plural', () => {
    expect(libraryRootChangeConfirmLabel(12)).toBe('Change root and update 12 animes');
    expect(libraryRootChangeConfirmLabel(1)).toBe('Change root and update 1 anime');
    expect(libraryRootChangeSummary(12)).toBe(
      'Your 12 active animes will point to the new root. Their folder inside the library stays the same. Inactive animes keep their saved folder.',
    );
    expect(libraryRootChangeSummary(1)).toBe(
      'Your 1 active anime will point to the new root. Its folder inside the library stays the same. Inactive animes keep their saved folder.',
    );
  });
});
