import { describe, expect, it } from 'vitest';
import type { EpisodeReanalysisReview, EpisodeReanalysisRow } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { shouldOpenEpisodeReview, toEpisodeReviewEdits, toEpisodeReviewView } from '../episode-reanalysis-review.helpers';

/** The folder every review in this suite read. */
const FOLDER = 'D:/Anime/Oshi no Ko';

/**
 * Builds one review row in whole minutes.
 * @param episode The episode number.
 * @param current Stored minutes, or 0.
 * @param measured Measured minutes, or 0.
 * @param result What confirming would do.
 * @param extra Fields to replace.
 * @returns The row.
 */
function row(episode: number, current: number, measured: number, result: EpisodeReanalysisRow['result'], extra: Partial<EpisodeReanalysisRow> = {}): EpisodeReanalysisRow {
  return {
    episode, basename: `e${episode}.mkv`, currentMs: current * 60_000, currentMinutes: current, currentSource: current > 0 ? 'measured' : '',
    measuredMs: measured * 60_000, measuredMinutes: measured, result, ...extra,
  };
}

/**
 * Builds an ok review.
 * @param rows Its rows.
 * @param overrides Fields to replace.
 * @returns The review.
 */
function review(rows: readonly EpisodeReanalysisRow[], overrides: Partial<EpisodeReanalysisReview> = {}): EpisodeReanalysisReview {
  return { outcome: 'ok', status: 'ok', filesRecognized: rows.length, rows, ...overrides };
}

describe('toEpisodeReviewView', () => {
  it('summarizes differences, offers to confirm the changes, and renders every row', () => {
    const view = toEpisodeReviewView({
      folder: FOLDER,
      review: review([
        row(1, 24, 24, 'unchanged'), row(4, 23, 46, 'update'), row(6, 24, 47, 'manual_kept', { currentSource: 'manual' }),
        row(8, 24, 25, 'update'), row(11, 0, 24, 'add'),
      ]),
    });

    expect(view).toEqual(expect.objectContaining({
      folder: FOLDER, alertStatus: 'success', title: 'Folder found · 5 episode files recognized',
      description: 'Review the differences below. Nothing is saved until you confirm.',
      confirmLabel: 'Confirm 3 changes', canTryAgain: false, dismissLabel: 'Cancel', dismissVariant: 'tertiary',
    }));
    expect(view.chips.map((chip) => [chip.label, chip.color])).toEqual([['2 changes', 'accent'], ['1 new', 'success'], ['1 manual kept', 'warning'], ['1 unchanged', 'default']]);
    expect(view.rows.map((reviewRow) => [reviewRow.number, reviewRow.current, reviewRow.measured, reviewRow.result.label])).toEqual([
      ['01', '24 min', '24 min', 'Unchanged'],
      ['04', '23 min', '46 min', 'Will update'],
      ['06', '24 min · manual', '47 min', 'Manual kept'],
      ['08', '24 min', '25 min', 'Will update'],
      ['11', '—', '24 min', 'Will add'],
    ]);
  });

  it('says everything is up to date, with Close only, when nothing differs', () => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([row(1, 24, 24, 'unchanged'), row(2, 24, 24, 'unchanged')]) });

    expect(view).toEqual(expect.objectContaining({
      alertStatus: 'success', title: 'Everything is up to date', description: '2 episodes measured. No duration differs from what is saved.',
      chips: [], rows: [], canTryAgain: false, dismissLabel: 'Close', dismissVariant: 'primary',
    }));
    expect(view.confirmLabel).toBeUndefined();
  });

  it('warns about skipped and unreadable files and says why each was skipped', () => {
    const view = toEpisodeReviewView({
      folder: FOLDER,
      review: review([
        row(0, 0, 0, 'skipped'), row(5, 0, 0, 'skipped', { detail: 'fractional' }), row(7, 24, 24, 'unchanged'),
        row(9, 24, 0, 'skipped'), row(10, 0, 0, 'unreadable'), row(11, 23, 46, 'update'),
      ]),
    });

    expect(view).toEqual(expect.objectContaining({ alertStatus: 'warning', title: '2 of 6 episodes measured', confirmLabel: 'Confirm 1 change' }));
    expect(view.description).toBe('Skipped files keep their saved duration. Fix them and re-analyze, or set the duration by hand.');
    expect(view.chips.map((chip) => [chip.label, chip.color])).toEqual([['1 change', 'accent'], ['3 skipped', 'default'], ['1 unreadable', 'danger'], ['1 unchanged', 'default']]);
    expect(view.rows.map((reviewRow) => [reviewRow.number, reviewRow.measured])).toEqual([
      ['—', 'no episode number'], ['05', 'half episode'], ['07', '24 min'], ['09', 'two files claim it'], ['10', 'could not read file'], ['11', '46 min'],
    ]);
  });

  it('offers Cancel, Try again and Apply when the folder stopped responding mid-analysis', () => {
    const view = toEpisodeReviewView({
      folder: FOLDER,
      review: review([row(4, 23, 46, 'update'), row(5, 24, 24, 'unchanged'), row(6, 0, 0, 'not_reached'), row(7, 24, 0, 'not_reached')], { status: 'interrupted' }),
    });

    expect(view).toEqual(expect.objectContaining({
      alertStatus: 'warning', title: 'The folder stopped responding after episode 5',
      description: 'Episodes that were not reached keep their current values. You can apply what was measured, or try again.',
      confirmLabel: 'Apply 1 change', canTryAgain: true, dismissLabel: 'Cancel',
    }));
    expect(view.chips.map((chip) => [chip.label, chip.color])).toEqual([['2 measured', 'success'], ['1 change', 'accent'], ['2 not reached', 'default']]);
    expect(view.rows.map((reviewRow) => reviewRow.measured)).toEqual(['46 min', '24 min', '—', '—']);
  });

  it('names the last measured episode, however many were measured before it', () => {
    const view = toEpisodeReviewView({
      folder: FOLDER,
      review: review([row(1, 24, 24, 'unchanged'), row(2, 24, 24, 'unchanged'), row(3, 24, 24, 'unchanged'), row(4, 0, 0, 'not_reached')], { status: 'interrupted' }),
    });

    expect(view.title).toBe('The folder stopped responding after episode 3');
  });

  it('offers no Apply on an interruption that measured no change', () => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([row(1, 0, 0, 'not_reached')], { status: 'interrupted' }) });

    expect(view.title).toBe('The folder stopped responding');
    expect(view.confirmLabel).toBeUndefined();
    expect(view.canTryAgain).toBe(true);
  });

  it('keeps a completed review with only manual-kept rows open with Close and no Confirm', () => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([row(1, 24, 24, 'unchanged'), row(6, 24, 47, 'manual_kept', { currentSource: 'manual' })]) });

    expect(view).toEqual(expect.objectContaining({ alertStatus: 'success', dismissLabel: 'Close', canTryAgain: false }));
    expect(view.chips.map((chip) => chip.label)).toEqual(['1 manual kept', '1 unchanged']);
    expect(view.confirmLabel).toBeUndefined();
  });

  it('warns, rather than calling it up to date, when one file was skipped and one was unreadable', () => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([row(1, 0, 0, 'skipped'), row(2, 0, 0, 'unreadable'), row(3, 24, 24, 'unchanged')]) });

    expect(view).toEqual(expect.objectContaining({ alertStatus: 'warning', title: '1 of 3 episodes measured', dismissLabel: 'Close' }));
  });

  it('counts only files that gave a reading as measured, and never offers a reading of zero', () => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([row(1, 24, 24, 'unchanged'), row(2, 24, 0, 'update')]) });

    expect(view.title).toBe('Everything is up to date');
    expect(view.description).toBe('1 episode measured. No duration differs from what is saved.');
    expect(view.confirmLabel).toBeUndefined();
  });

  it('shows an unknown result by its raw name in a neutral chip', () => {
    const unknown = row(1, 24, 25, 'future' as EpisodeReanalysisRow['result']);

    expect(toEpisodeReviewView({ folder: FOLDER, review: review([unknown, row(2, 23, 46, 'update')]) }).rows[0]?.result).toEqual({ label: 'future', color: 'default' });
  });

  it.each([
    [{ status: 'no_files' as const }, 'warning', 'No episode files recognized'],
    [{ status: 'probe_unavailable' as const }, 'danger', 'Duration reader not available'],
    [{ status: 'no_folder' as const }, 'warning', 'No folder set'],
    [{ status: 'folder_missing' as const }, 'warning', 'Folder not found'],
  ])('closes for %o and says saved durations were not touched', (overrides, alertStatus, title) => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([], overrides) });

    expect(view).toEqual(expect.objectContaining({ alertStatus, title, dismissLabel: 'Close', canTryAgain: false }));
    expect(view.description).toContain('Saved durations were not touched');
    expect(view.confirmLabel).toBeUndefined();
  });

  it.each([
    [{ outcome: 'busy' as const }, 'warning', 'A re-analysis is already running'],
    [{ outcome: 'error' as const, message: 'boom' }, 'danger', 'The folder could not be analyzed'],
  ])('closes for %o with an explanation', (overrides, alertStatus, title) => {
    const view = toEpisodeReviewView({ folder: FOLDER, review: review([], overrides) });

    expect(view).toEqual(expect.objectContaining({ alertStatus, title, dismissLabel: 'Close', canTryAgain: false }));
    expect(view.description).not.toBe('');
    expect(view.confirmLabel).toBeUndefined();
  });

  it('shows the error message the backend sent', () => {
    expect(toEpisodeReviewView({ folder: FOLDER, review: review([], { outcome: 'error', message: 'disk gone' }) }).description).toBe('disk gone');
  });
});

describe('toEpisodeReviewEdits', () => {
  it('moves only update and add rows into the draft as measured edits, keeping unrelated edits', () => {
    const existing = [{ episode: 2, durationMs: 1_500_000, source: 'manual' as const, clear: false }];
    const edits = toEpisodeReviewEdits(review([
      row(1, 24, 24, 'unchanged'), row(4, 23, 46, 'update'), row(6, 24, 47, 'manual_kept'), row(9, 0, 0, 'skipped'), row(11, 0, 24, 'add'),
    ]), existing);

    expect(edits).toEqual([
      existing[0],
      { episode: 4, durationMs: 46 * 60_000, source: 'measured', clear: false },
      { episode: 11, durationMs: 24 * 60_000, source: 'measured', clear: false },
    ]);
  });

  it('never replaces an unsaved manual value with a measured one', () => {
    const pendingManual = { episode: 4, durationMs: 50 * 60_000, source: 'manual' as const, clear: false };

    expect(toEpisodeReviewEdits(review([row(4, 23, 46, 'update')]), [pendingManual])).toEqual([pendingManual]);
  });

  it('replaces a pending measured edit and a pending clear with the new reading, in episode order', () => {
    const existing = [
      { episode: 20, durationMs: 22 * 60_000, source: 'manual' as const, clear: false },
      { episode: 12, durationMs: 0, source: 'manual' as const, clear: true },
      { episode: 9, durationMs: 20 * 60_000, source: 'measured' as const, clear: false },
    ];
    const edits = toEpisodeReviewEdits(review([row(3, 0, 24, 'add'), row(9, 20, 21, 'update'), row(12, 24, 25, 'update')]), existing);

    expect(edits).toEqual([
      { episode: 3, durationMs: 24 * 60_000, source: 'measured', clear: false },
      { episode: 9, durationMs: 21 * 60_000, source: 'measured', clear: false },
      { episode: 12, durationMs: 25 * 60_000, source: 'measured', clear: false },
      existing[0],
    ]);
  });
});

describe('shouldOpenEpisodeReview', () => {
  it('opens every review except one the user cancelled', () => {
    expect(shouldOpenEpisodeReview(review([], { status: 'cancelled' }))).toBe(false);
    expect(shouldOpenEpisodeReview(review([], { status: 'interrupted' }))).toBe(true);
    expect(shouldOpenEpisodeReview(review([], { outcome: 'error', status: 'cancelled' }))).toBe(true);
  });
});
