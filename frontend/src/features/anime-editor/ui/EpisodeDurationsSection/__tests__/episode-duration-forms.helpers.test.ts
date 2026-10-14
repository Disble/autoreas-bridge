import { describe, expect, it } from 'vitest';
import type { EpisodeDurationSection } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { patchEpisodeForm, toAddedEpisodeEdit, toAppliedEpisodeEdit, toEpisodeEditForm, toEpisodeOpenEdit } from '../episode-duration-forms.helpers';
import { toEpisodeDurationRowViews } from '../episode-durations-section.helpers';
import type { EpisodeAddFormView } from '../episode-durations-section.types';

/** Episode 4 measured at 23 min 36 s, and episode 5 listed with no value. */
const SECTION: EpisodeDurationSection = {
  outcome: 'ok', folderStatus: 'found', beyondTotal: [], tv: true,
  rows: [
    { episode: 4, durationMs: 1_416_000, minutes: 24, long: false, source: 'measured' },
    { episode: 5, durationMs: 0, minutes: 0, long: false, source: 'not_measured' },
  ],
};

/** The rendered rows of {@link SECTION}. */
const ROWS = toEpisodeDurationRowViews(SECTION, []);

/**
 * Builds an add modal view.
 * @param canAdd Whether Add is allowed.
 * @returns The view.
 */
function addView(canAdd: boolean): EpisodeAddFormView {
  return { episode: '7', minutes: '25', isLongHintVisible: false, canAdd };
}

describe('toEpisodeEditForm', () => {
  it('prefills the current value in whole minutes, and nothing for an episode with no value', () => {
    expect(toEpisodeEditForm(ROWS, 4)).toEqual({ episode: 4, minutes: '24' });
    expect(toEpisodeEditForm(ROWS, 5)).toEqual({ episode: 5, minutes: '' });
    expect(toEpisodeEditForm(ROWS, 9)).toEqual({ episode: 9, minutes: '' });
  });
});

describe('toEpisodeOpenEdit', () => {
  it('opens on a listed episode only', () => {
    expect(toEpisodeOpenEdit(undefined, ROWS)).toBeUndefined();
    expect(toEpisodeOpenEdit({ episode: 9, minutes: '20' }, ROWS)).toBeUndefined();
    expect(toEpisodeOpenEdit({ episode: 4, minutes: '30' }, ROWS)).toEqual({
      row: ROWS[0],
      view: { title: 'Episode 04 duration', minutes: '30', sourceLine: 'Measured from the file', canApply: true, canClear: true },
    });
  });
});

describe('patchEpisodeForm', () => {
  it('changes one field of an open form and keeps a closed form closed', () => {
    expect(patchEpisodeForm({ episode: '3', minutes: '' }, { minutes: '24' })).toEqual({ episode: '3', minutes: '24' });
    expect(patchEpisodeForm<{ readonly minutes: string }>(undefined, { minutes: '24' })).toBeUndefined();
  });
});

describe('toAppliedEpisodeEdit', () => {
  it('applies whole minutes above zero as a manual value, and nothing otherwise', () => {
    expect(toAppliedEpisodeEdit({ episode: 4, minutes: '46' })).toEqual({ episode: 4, durationMs: 46 * 60_000, source: 'manual', clear: false });
    expect(toAppliedEpisodeEdit({ episode: 4, minutes: '0' })).toBeUndefined();
    expect(toAppliedEpisodeEdit(undefined)).toBeUndefined();
  });
});

describe('toAddedEpisodeEdit', () => {
  it('adds a manual value only when the add modal allows it', () => {
    const form = { episode: '7', minutes: '25' };

    expect(toAddedEpisodeEdit(form, addView(true))).toEqual({ episode: 7, durationMs: 25 * 60_000, source: 'manual', clear: false });
    expect(toAddedEpisodeEdit(form, addView(false))).toBeUndefined();
    expect(toAddedEpisodeEdit(form, undefined)).toBeUndefined();
    expect(toAddedEpisodeEdit(undefined, addView(true))).toBeUndefined();
  });
});
