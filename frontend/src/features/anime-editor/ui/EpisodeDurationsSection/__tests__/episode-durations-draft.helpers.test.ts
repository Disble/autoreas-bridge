import { describe, expect, it } from 'vitest';
import { formatEpisodeUnsavedChanges, isEpisodeEditingLocked, settleEpisodeDurationsSave, toEpisodeDurationsFooter, toEpisodeDurationsToggleLabel } from '../episode-durations-draft.helpers';
import type { EpisodeDurationsDraftState } from '../episode-durations-section.types';

/** A saving draft with one edit and an old error, at revision 2. */
const SAVING: EpisodeDurationsDraftState = {
  edits: [{ episode: 4, durationMs: 2_760_000, source: 'manual', clear: false }],
  revision: 2,
  isSaving: true,
  saveError: 'old',
};

describe('formatEpisodeUnsavedChanges', () => {
  it.each([
    { count: 0, want: 'No unsaved changes' },
    { count: 1, want: '1 unsaved change' },
    { count: 3, want: '3 unsaved changes' },
  ])('says $want for $count edits', ({ count, want }) => {
    expect(formatEpisodeUnsavedChanges(count)).toBe(want);
  });
});

describe('toEpisodeDurationsToggleLabel', () => {
  it('offers to show a hidden table and to hide an open one', () => {
    expect(toEpisodeDurationsToggleLabel(false)).toBe('Show episodes');
    expect(toEpisodeDurationsToggleLabel(true)).toBe('Hide episodes');
  });
});

describe('toEpisodeDurationsFooter', () => {
  it('hides the footer of a closed card with nothing unsaved', () => {
    expect(toEpisodeDurationsFooter({ changes: 0, isOpen: false, isRunning: false, isSaving: false })).toEqual({
      isVisible: false, unsavedLabel: 'No unsaved changes', canSave: false, canDiscard: false,
    });
  });

  it('shows the footer of an open card, with Save and Discard disabled while nothing is unsaved', () => {
    expect(toEpisodeDurationsFooter({ changes: 0, isOpen: true, isRunning: false, isSaving: false })).toEqual({
      isVisible: true, unsavedLabel: 'No unsaved changes', canSave: false, canDiscard: false,
    });
  });

  it('keeps the footer of a hidden card with unsaved edits, so hiding the table never hides the draft', () => {
    expect(toEpisodeDurationsFooter({ changes: 2, isOpen: false, isRunning: false, isSaving: false })).toEqual({
      isVisible: true, unsavedLabel: '2 unsaved changes', canSave: true, canDiscard: true,
    });
  });

  it('disables Save while a re-analysis runs, and both actions while a save is in flight', () => {
    expect(toEpisodeDurationsFooter({ changes: 1, isOpen: true, isRunning: true, isSaving: false })).toEqual(expect.objectContaining({ canSave: false, canDiscard: true }));
    expect(toEpisodeDurationsFooter({ changes: 1, isOpen: true, isRunning: false, isSaving: true })).toEqual(expect.objectContaining({ canSave: false, canDiscard: false }));
  });
});

describe('settleEpisodeDurationsSave', () => {
  it.each(['applied', 'no_op'] as const)('clears the edits, bumps the revision and drops the error after %s', (outcome) => {
    expect(settleEpisodeDurationsSave(SAVING, { outcome, changed: 1 })).toEqual({ edits: [], revision: 3, isSaving: false, saveError: undefined });
  });

  it('keeps the edits and the revision and records the message after an error', () => {
    expect(settleEpisodeDurationsSave(SAVING, { outcome: 'error', message: 'disk full', changed: 0 })).toEqual({ ...SAVING, isSaving: false, saveError: 'disk full' });
  });
});

describe('isEpisodeEditingLocked', () => {
  it('locks row edits while an analysis runs or a save is in flight, and only then', () => {
    expect(isEpisodeEditingLocked(true, false)).toBe(true);
    expect(isEpisodeEditingLocked(false, true)).toBe(true);
    expect(isEpisodeEditingLocked(false, false)).toBe(false);
  });
});
