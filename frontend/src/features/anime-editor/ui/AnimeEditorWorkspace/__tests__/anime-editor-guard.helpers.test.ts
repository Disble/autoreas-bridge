import { describe, expect, it, vi } from 'vitest';
import { combineGuardSaveResults, isAnyCard, saveDirtyCards, toEpisodesGuardResult } from '../anime-editor-guard.helpers';
import { reduceAnimeEditorGuard } from '../anime-editor-workspace.helpers';

describe('reduceAnimeEditorGuard', () => {
  it('opens one pending transition and clears it on stay or completion', () => {
    const opened = reduceAnimeEditorGuard({ pendingAction: undefined }, { type: 'request', action: { type: 'select', animeId: 'anime-2' } });
    expect(opened.pendingAction).toEqual({ type: 'select', animeId: 'anime-2' });
    expect(reduceAnimeEditorGuard(opened, { type: 'stay' }).pendingAction).toBeUndefined();
    expect(reduceAnimeEditorGuard(opened, { type: 'complete' }).pendingAction).toBeUndefined();
  });
});

describe('toEpisodesGuardResult', () => {
  it('reads an episodes save like an anime save for the guard, and nothing as nothing', () => {
    expect(toEpisodesGuardResult({ outcome: 'applied', changed: 1 })).toEqual({ outcome: 'applied', message: '' });
    expect(toEpisodesGuardResult({ outcome: 'error', message: 'disk full', changed: 0 })).toEqual({ outcome: 'error', message: 'disk full' });
    expect(toEpisodesGuardResult(undefined)).toBeUndefined();
  });
});

describe('combineGuardSaveResults', () => {
  /** An applied anime save. */
  const applied = { outcome: 'applied' as const, message: 'saved' };

  it('continues on the last answer when every dirty card saved, and on a no-op when none was dirty', () => {
    const noOp = { outcome: 'no_op' as const, message: '' };
    expect(combineGuardSaveResults([applied, noOp])).toBe(noOp);
    expect(combineGuardSaveResults([applied, { ...applied }, noOp])).toBe(noOp);
    expect(combineGuardSaveResults([])).toEqual({ outcome: 'no_op', message: '' });
  });

  it('stops on the first card that did not save, wherever it is', () => {
    const failed = { outcome: 'error' as const, message: 'disk full' };
    expect(combineGuardSaveResults([applied, failed])).toBe(failed);
    expect(combineGuardSaveResults([failed, applied])).toBe(failed);
    expect(combineGuardSaveResults([undefined, applied])).toBeUndefined();
  });
});

describe('saveDirtyCards', () => {
  it('saves only the dirty cards, each in order, and answers the first that did not save', async () => {
    const calls: string[] = [];
    const failed = { outcome: 'error' as const, message: 'disk full' };
    const result = await saveDirtyCards([
      { isDirty: true, save: async () => { calls.push('anime'); return failed; } },
      { isDirty: false, save: async () => { calls.push('clean'); return { outcome: 'applied', message: '' }; } },
      { isDirty: true, save: async () => { calls.push('episodes'); return { outcome: 'applied', message: '' }; } },
    ]);

    expect(calls).toEqual(['anime', 'episodes']);
    expect(result).toBe(failed);
  });

  it('continues on a no-op when nothing is dirty', async () => {
    expect(await saveDirtyCards([{ isDirty: false, save: vi.fn() }])).toEqual({ outcome: 'no_op', message: '' });
  });
});

describe('isAnyCard', () => {
  it('is true when either card holds the flag, and false only when none does', () => {
    expect(isAnyCard(false, true)).toBe(true);
    expect(isAnyCard(true, false)).toBe(true);
    expect(isAnyCard(false, false)).toBe(false);
  });
});
