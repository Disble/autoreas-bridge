import { describe, expect, it } from 'vitest';
import { reduceAnimeEditorGuard } from '../anime-editor-workspace.helpers';

describe('reduceAnimeEditorGuard', () => {
  it('opens one pending transition and clears it on stay or completion', () => {
    const opened = reduceAnimeEditorGuard({ pendingAction: undefined }, { type: 'request', action: { type: 'select', animeId: 'anime-2' } });
    expect(opened.pendingAction).toEqual({ type: 'select', animeId: 'anime-2' });
    expect(reduceAnimeEditorGuard(opened, { type: 'stay' }).pendingAction).toBeUndefined();
    expect(reduceAnimeEditorGuard(opened, { type: 'complete' }).pendingAction).toBeUndefined();
  });
});
