import { describe, expect, it, vi } from 'vitest';
import type { EpisodeDurationRow, EpisodeDurationRuntimeSource, EpisodeDurationSection } from '../../../../../shared/contracts/episode-durations.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
import {
  classifyEpisodeDurationsView,
  clearEpisodeDuration,
  nextEpisodeNumber,
  parsePositiveWholeNumber,
  summarizeEpisodeDurations,
  toEpisodeAddFormView,
  toEpisodeDurationRequest,
  toEpisodeDurationRowViews,
  toEpisodeDurationsBanner,
  toEpisodeDurationsLoad,
  isEpisodeDurationsTargetPending,
  readEpisodeDurationSection,
  toEpisodeDurationsQueryKey,
  toEpisodeDurationsNotes,
  toEpisodeDurationsOverview,
  toEpisodeEditFormView,
  toEpisodeReanalysisProgressView,
  toEpisodeReanalyzeButton,
  upsertEpisodeEdit,
} from '../episode-durations-section.helpers';
import { EPISODE_DURATIONS_UNSETTLED } from '../episode-durations-section.constants';

/**
 * Builds one stored section row.
 * @param episode The episode number.
 * @param minutes Whole minutes, or 0 for a row with no value.
 * @param source The row source.
 * @returns The row.
 */
function row(episode: number, minutes: number, source: EpisodeDurationRow['source'] = 'measured'): EpisodeDurationRow {
  return { episode, durationMs: minutes * 60_000, minutes, long: minutes > 30, source };
}

/**
 * Builds a section read for one draft.
 * @param overrides Fields to replace on a found-folder TV section.
 * @returns The section.
 */
function section(overrides: Partial<EpisodeDurationSection> = {}): EpisodeDurationSection {
  return { folderStatus: 'found', rows: [], beyondTotal: [], tv: true, ...overrides };
}

/**
 * Builds one manual edit in whole minutes.
 * @param episode The episode number.
 * @param minutes Whole minutes.
 * @returns The edit.
 */
function manual(episode: number, minutes: number): EpisodeDurationEdit {
  return { episode, durationMs: minutes * 60_000, source: 'manual', clear: false };
}

describe('toEpisodeDurationRequest', () => {
  it('follows the draft: trimmed folder, whole-number total and type, nothing without a loaded anime', () => {
    expect(toEpisodeDurationRequest('anime-1', '  D:/Anime/Frieren ', '12', '0')).toEqual({ animeId: 'anime-1', folder: 'D:/Anime/Frieren', totalEpisodes: 12, kind: 0 });
    expect(toEpisodeDurationRequest('anime-1', '', ' 12 ', ' 1 ')).toEqual({ animeId: 'anime-1', folder: '', totalEpisodes: 12, kind: 1 });
    expect(toEpisodeDurationRequest('anime-1', '', '', '')).toStrictEqual({ animeId: 'anime-1', folder: '' });
    expect(toEpisodeDurationRequest('anime-1', '', '12.5', 'abc')).toStrictEqual({ animeId: 'anime-1', folder: '' });
    expect(toEpisodeDurationRequest(undefined, 'D:/x', '12', '0')).toBeUndefined();
  });
});

describe('toEpisodeDurationsLoad', () => {
  /** A loaded anime's request. */
  const REQUEST = { animeId: 'anime-1', folder: 'D:/x' };

  it('reads the query as idle with no record, loading, failed with its message, or ready, and a pending newer key as loading', () => {
    const ready = { kind: 'ready', data: section(), isRefreshing: false } as const;
    expect(toEpisodeDurationsLoad(undefined, ready, false)).toEqual({ status: 'idle' });
    expect(toEpisodeDurationsLoad(REQUEST, { kind: 'loading' }, false)).toEqual({ status: 'loading' });
    expect(toEpisodeDurationsLoad(REQUEST, { kind: 'failure', code: 'failed_precondition', message: 'episodes: down' }, false)).toEqual({ status: 'failed', message: 'episodes: down' });
    expect(toEpisodeDurationsLoad(REQUEST, ready, false)).toEqual({ status: 'ready', section: section() });
    // Another key's placeholder reads as loading, never as the previous anime section.
    expect(toEpisodeDurationsLoad(REQUEST, { kind: 'ready', data: section(), isRefreshing: true }, true)).toEqual({ status: 'loading' });
    // An older read failure reads as loading while a newer request settles.
    expect(toEpisodeDurationsLoad(REQUEST, { kind: 'failure', code: 'internal', message: 'old' }, true)).toEqual({ status: 'loading' });
  });
});

describe('isEpisodeDurationsTargetPending', () => {
  /** One settled request. */
  const REQUEST = { animeId: 'anime-1', folder: 'D:/x', totalEpisodes: 12, kind: 0 };

  it('is pending before any read settled, or while the request or revision differs from the settled one', () => {
    expect(isEpisodeDurationsTargetPending(EPISODE_DURATIONS_UNSETTLED, REQUEST, 0)).toBe(true);
    expect(isEpisodeDurationsTargetPending(EPISODE_DURATIONS_UNSETTLED, undefined, 0)).toBe(false);
    expect(isEpisodeDurationsTargetPending({ request: REQUEST, revision: 0 }, REQUEST, 0)).toBe(false);
    expect(isEpisodeDurationsTargetPending({ request: REQUEST, revision: 0 }, { ...REQUEST }, 0)).toBe(true);
    expect(isEpisodeDurationsTargetPending({ request: REQUEST, revision: 0 }, REQUEST, 1)).toBe(true);
  });
});

describe('readEpisodeDurationSection', () => {
  it('reads the saved anime section, and rejects without calling the source when no record is loaded', async () => {
    const request = { animeId: 'anime-1', folder: 'D:/x', totalEpisodes: 12, kind: 0 };
    const getEpisodeDurationSection = vi.fn().mockResolvedValue(section());
    const source = { getEpisodeDurationSection } as unknown as EpisodeDurationRuntimeSource;

    await expect(readEpisodeDurationSection(source, request)).resolves.toEqual(section());
    expect(getEpisodeDurationSection).toHaveBeenCalledWith(request);
    await expect(readEpisodeDurationSection(source, undefined)).rejects.toThrow('no anime selected');
    expect(getEpisodeDurationSection).toHaveBeenCalledTimes(1);
  });
});

describe('toEpisodeDurationsQueryKey', () => {
  it('names every saved field the read depends on and the save revision', () => {
    expect(toEpisodeDurationsQueryKey({ animeId: 'anime-1', folder: 'D:/x', totalEpisodes: 12, kind: 0 }, 3))
      .toEqual(['episode-durations', 'section', 'anime-1', 'D:/x', 12, 0, 3]);
    expect(toEpisodeDurationsQueryKey({ animeId: 'anime-1', folder: '' }, 0)).toEqual(['episode-durations', 'section', 'anime-1', '', null, null, 0]);
    expect(toEpisodeDurationsQueryKey(undefined, 0)).toEqual(['episode-durations', 'section', null, null, null, null, 0]);
  });
});

describe('toEpisodeDurationRowViews', () => {
  it('renders stored rows with minutes, the backend long mark, source labels, source lines and padded numbers', () => {
    const views = toEpisodeDurationRowViews(section({ rows: [row(2, 24), row(1, 47), row(3, 0, 'not_measured_file_found')] }), []);

    expect(views.map((view) => [view.number, view.durationLabel, view.isLong, view.sourceLabel, view.isUnsaved])).toEqual([
      ['01', '47 min', true, 'Measured', false],
      ['02', '24 min', false, 'Measured', false],
      ['03', '—', false, 'Not measured · file found', false],
    ]);
    expect(views[0]?.editLabel).toBe('Edit episode 1 duration');
    expect(views[0]?.sourceLine).toBe('Measured from the file');
    expect(views[2]?.sourceLine).toBe('Not measured yet');

    // A stored manual value is set by hand and keeps the long mark the backend stored.
    const stored = { episode: 3, durationMs: 45 * 60_000, minutes: 45, long: false, source: 'manual' as const };
    const [view] = toEpisodeDurationRowViews(section({ rows: [stored] }), []);
    expect(view?.sourceLine).toBe('Set by hand');
    expect(view?.isLong).toBe(false);
  });

  it('applies the draft edits as Unsaved rows, adds new episodes, and computes long above 30 minutes for TV only', () => {
    const edits = [manual(4, 46), manual(8, 62), { episode: 1, durationMs: 0, source: 'manual' as const, clear: true }];
    const tv = toEpisodeDurationRowViews(section({ rows: [row(1, 24), row(4, 23, 'manual')] }), edits);
    const movie = toEpisodeDurationRowViews(section({ rows: [row(1, 24)], tv: false }), [manual(8, 62)]);

    expect(tv.map((view) => [view.episode, view.durationLabel, view.isLong, view.isUnsaved, view.sourceLabel])).toEqual([
      [1, '—', false, true, 'Not measured'],
      [4, '46 min', true, true, 'Manual'],
      [8, '62 min', true, true, 'Manual · no file yet'],
    ]);
    expect(tv[1]?.sourceLine).toBe('Set by hand');
    expect(tv[0]?.isStored).toBe(true);
    expect(tv[2]?.isStored).toBe(false);
    expect(movie.find((view) => view.episode === 8)?.isLong).toBe(false);

    // Exactly 30 minutes is not long; 30 minutes plus one millisecond is.
    const boundary = toEpisodeDurationRowViews(section(), [
      { episode: 1, durationMs: 1_800_000, source: 'manual', clear: false },
      { episode: 2, durationMs: 1_800_001, source: 'measured', clear: false },
    ]);
    expect(boundary.map((view) => view.isLong)).toEqual([false, true]);
  });

  it('says Manual for an edit whose file exists or whose folder is not found, "no file yet" without a file, and Measured for a confirmed reading', () => {
    const found = toEpisodeDurationRowViews(section({ rows: [row(2, 0, 'not_measured_file_found')] }), [manual(2, 30)]);
    const missing = toEpisodeDurationRowViews(section({ folderStatus: 'missing' }), [manual(9, 30)]);
    const measured = toEpisodeDurationRowViews(section(), [{ episode: 3, durationMs: 31 * 60_000, source: 'measured', clear: false }]);

    expect(found[0]?.sourceLabel).toBe('Manual');
    expect(missing[0]?.sourceLabel).toBe('Manual');
    expect(measured[0]?.sourceLabel).toBe('Measured');
    expect(measured[0]?.sourceLine).toBe('Measured from the file');
    expect(measured[0]?.isLong).toBe(true);

    // In a found folder: Manual over a measured file, "no file yet" over an episode with no file.
    const views = toEpisodeDurationRowViews(section({ rows: [row(1, 24), row(2, 0, 'not_measured')] }), [manual(1, 25), manual(2, 25)]);
    expect(views.map((view) => view.sourceLabel)).toEqual(['Manual', 'Manual · no file yet']);
  });
});

describe('summarizeEpisodeDurations', () => {
  it('counts measured of listed episodes and the long ones', () => {
    const views = toEpisodeDurationRowViews(section({ rows: [row(1, 47), row(2, 24), row(3, 0, 'not_measured')] }), []);

    expect(summarizeEpisodeDurations(views)).toEqual({ label: '2 of 3 measured', longLabel: '1 long' });
    expect(summarizeEpisodeDurations(views.slice(1))).toEqual({ label: '1 of 2 measured' });
    expect(summarizeEpisodeDurations([])).toEqual({ label: 'No episodes yet' });
  });
});

describe('classifyEpisodeDurationsView', () => {
  it('keeps loading, failure, empty and table exclusive', () => {
    const rows = toEpisodeDurationRowViews(section({ rows: [row(1, 24)] }), []);

    expect(classifyEpisodeDurationsView({ status: 'idle' }, rows)).toBe('idle');
    expect(classifyEpisodeDurationsView({ status: 'loading' }, rows)).toBe('loading');
    expect(classifyEpisodeDurationsView({ status: 'failed', message: 'x' }, rows)).toBe('failed');
    expect(classifyEpisodeDurationsView({ status: 'ready', section: section() }, [])).toBe('empty');
    expect(classifyEpisodeDurationsView({ status: 'ready', section: section() }, rows)).toBe('table');
  });
});

describe('toEpisodeDurationsBanner', () => {
  /** A request with a folder and Total episodes 12. */
  const request = { animeId: 'anime-1', folder: 'D:/Anime/Dandadan', totalEpisodes: 12 };

  it('covers the state matrix banners and explains every informational one', () => {
    const someRows = toEpisodeDurationRowViews(section({ rows: [row(1, 0, 'not_measured')] }), []);

    expect(toEpisodeDurationsBanner(section({ folderStatus: 'none' }), someRows, request)?.title).toBe('No folder set');
    expect(toEpisodeDurationsBanner(section({ folderStatus: 'none' }), [], request)).toBeUndefined();
    expect(toEpisodeDurationsBanner(section({ folderStatus: 'missing', rows: [row(1, 24)] }), someRows, request)).toEqual(expect.objectContaining({ status: 'accent', title: 'Showing saved durations' }));
    expect(toEpisodeDurationsBanner(section({ folderStatus: 'missing', rows: [row(1, 0, 'not_measured')] }), [], request)).toEqual({
      status: 'warning', title: 'Folder not found', description: 'D:/Anime/Dandadan does not exist. Pick the folder again to measure episodes.',
    });
    expect(toEpisodeDurationsBanner(section(), someRows, request)).toBeUndefined();

    // Every informational banner explains itself, and saved durations keep showing while some episodes have none.
    const noFolder = toEpisodeDurationsBanner(section({ folderStatus: 'none' }), someRows, request);
    const saved = toEpisodeDurationsBanner(section({ folderStatus: 'missing', rows: [row(1, 0, 'not_measured'), row(2, 24)] }), someRows, request);

    expect(noFolder?.status).toBe('accent');
    expect(noFolder?.description).not.toBe('');
    expect(saved?.title).toBe('Showing saved durations');
    expect(saved?.description).not.toBe('');
  });

  it('names the episodes beyond the total in the singular and the plural, or says the total is unknown when it is unset', () => {
    const banner = toEpisodeDurationsBanner(section({ beyondTotal: [13] }), [], { animeId: 'anime-1', folder: 'D:/x' });
    expect(banner?.description).toContain('Total episodes is unknown');

    expect(toEpisodeDurationsBanner(section({ beyondTotal: [13] }), [], request)).toEqual({
      status: 'warning', title: 'Episode 13 is beyond the total',
      description: 'Total episodes is 12, but the folder has an episode 13. Update the total, or check the file.',
    });
    expect(toEpisodeDurationsBanner(section({ beyondTotal: [13, 14] }), [], request)).toEqual({
      status: 'warning', title: 'Episodes 13, 14 are beyond the total',
      description: 'Total episodes is 12, but the folder has episodes 13, 14. Update the total, or check the files.',
    });
  });
});

describe('toEpisodeDurationsOverview', () => {
  /** A request with a folder and no Total episodes. */
  const request = { animeId: 'anime-1', folder: 'D:/Anime/Dandadan' };

  it('says nothing about a read that has not resolved, carries a failure message, and shows the empty copy of a read with no episode', () => {
    const idle = { view: 'idle', summary: undefined, banner: undefined, notes: [], emptyCopy: undefined, failureMessage: undefined, isTV: false };

    expect(toEpisodeDurationsOverview({ status: 'idle' }, [], request)).toEqual(idle);
    expect(toEpisodeDurationsOverview({ status: 'loading' }, [], undefined)).toEqual({ ...idle, view: 'loading' });
    expect(toEpisodeDurationsOverview({ status: 'failed', message: 'disk gone' }, [], request)).toEqual({ ...idle, view: 'failed', failureMessage: 'disk gone' });
    expect(toEpisodeDurationsOverview({ status: 'ready', section: section({ folderStatus: 'missing' }) }, [], request)).toEqual(expect.objectContaining({
      view: 'empty', summary: { label: 'No episodes yet' }, notes: [], emptyCopy: expect.objectContaining({ title: 'Nothing measured for this anime' }),
    }));
  });

  it('summarizes a listed section with its alert and notes, offers no empty copy, and drops both without a request', () => {
    const read = section({ folderStatus: 'none', rows: [row(1, 47)], tv: false });
    const rows = toEpisodeDurationRowViews(read, []);

    expect(toEpisodeDurationsOverview({ status: 'ready', section: read }, rows, request)).toEqual({
      view: 'table', summary: { label: '1 of 1 measured', longLabel: '1 long' }, banner: expect.objectContaining({ title: 'No folder set' }),
      notes: toEpisodeDurationsNotes(read, request, rows), emptyCopy: undefined, failureMessage: undefined, isTV: false,
    });
    expect(toEpisodeDurationsOverview({ status: 'ready', section: section({ rows: [row(1, 24)] }) }, toEpisodeDurationRowViews(section({ rows: [row(1, 24)] }), []), request).isTV).toBe(true);

    // No alert and no notes without the request they describe.
    const beyond = section({ beyondTotal: [13], rows: [row(1, 24)], tv: false });
    const overview = toEpisodeDurationsOverview({ status: 'ready', section: beyond }, toEpisodeDurationRowViews(beyond, []), undefined);
    expect(overview.banner).toBeUndefined();
    expect(overview.notes).toEqual([]);
  });
});

describe('toEpisodeDurationsNotes', () => {
  it('adds the total-unknown and not-TV notes only when rows are listed', () => {
    const rows = toEpisodeDurationRowViews(section({ rows: [row(1, 24)] }), []);

    expect(toEpisodeDurationsNotes(section({ tv: false }), { animeId: 'a', folder: '' }, rows)).toEqual([
      'The list grows as episodes are downloaded; set Total episodes to list the whole season.',
      'Long-episode marks apply to TV series only. Durations are kept for every type.',
    ]);
    expect(toEpisodeDurationsNotes(section(), { animeId: 'a', folder: '', totalEpisodes: 12 }, rows)).toEqual([]);
    expect(toEpisodeDurationsNotes(section({ tv: false }), { animeId: 'a', folder: '' }, [])).toEqual([]);
  });
});

describe('toEpisodeReanalyzeButton', () => {
  it('carries the disabled reason in the accessible name and the tooltip', () => {
    /** A ready load for one folder status. */
    const ready = (folderStatus: EpisodeDurationSection['folderStatus']) => ({ status: 'ready' as const, section: section({ folderStatus }) });

    expect(toEpisodeReanalyzeButton(ready('found'), false)).toEqual({ isDisabled: false, ariaLabel: 'Re-analyze folder', tooltip: 'Re-analyze folder' });
    expect(toEpisodeReanalyzeButton(ready('none'), false)).toEqual({ isDisabled: true, ariaLabel: 'Re-analyze folder (Set a folder first)', tooltip: 'Re-analyze folder · Set a folder first' });
    expect(toEpisodeReanalyzeButton(ready('missing'), false).ariaLabel).toBe('Re-analyze folder (Folder not found)');
    expect(toEpisodeReanalyzeButton(ready('found'), true).ariaLabel).toBe('Re-analyze folder (Analyzing…)');
    expect(toEpisodeReanalyzeButton({ status: 'loading' }, false)).toEqual({ isDisabled: true, ariaLabel: 'Re-analyze folder', tooltip: 'Re-analyze folder' });
  });
});

describe('toEpisodeReanalysisProgressView', () => {
  it('names the episode and the file position, and starts at zero before the first file', () => {
    expect(toEpisodeReanalysisProgressView(undefined)).toEqual({ label: 'Measuring…', percent: 0 });
    expect(toEpisodeReanalysisProgressView({ animeId: 'a', index: 0, total: 0, episode: 0 })).toEqual({ label: 'Measuring…', percent: 0 });
    expect(toEpisodeReanalysisProgressView({ animeId: 'a', index: 5, total: 12, episode: 17 })).toEqual({ label: 'Measuring episode 17 · 5 of 12', percent: 33 });
  });
});

describe('episode edits', () => {
  it('replaces an earlier edit of the same episode in order, clears a stored duration and drops a never-stored pending value', () => {
    expect(upsertEpisodeEdit([manual(5, 24), manual(2, 23)], manual(2, 46))).toEqual([manual(2, 46), manual(5, 24)]);

    const views = toEpisodeDurationRowViews(section({ rows: [row(1, 24)] }), [manual(8, 62)]);
    const stored = views.find((view) => view.episode === 1);
    const pendingOnly = views.find((view) => view.episode === 8);

    expect(stored === undefined || pendingOnly === undefined).toBe(false);
    expect(clearEpisodeDuration([manual(8, 62)], stored!)).toEqual([{ episode: 1, durationMs: 0, source: 'manual', clear: true }, manual(8, 62)]);
    expect(clearEpisodeDuration([manual(3, 20), manual(8, 62)], pendingOnly!)).toEqual([manual(3, 20)]);
  });
});

describe('parsePositiveWholeNumber and nextEpisodeNumber', () => {
  it('accepts whole numbers above zero only and suggests the episode after the highest known one, or 1', () => {
    expect(['24', ' 7 ', '0', '-1', '2.5', '', 'x'].map(parsePositiveWholeNumber)).toEqual([24, 7, undefined, undefined, undefined, undefined, undefined]);
    expect(nextEpisodeNumber(toEpisodeDurationRowViews(section({ rows: [row(7, 24), row(3, 24)] }), []))).toBe(8);
    expect(nextEpisodeNumber([])).toBe(1);
  });
});

describe('toEpisodeAddFormView', () => {
  /** Episodes 5 (24 min) and 6 (not measured). */
  const rows = toEpisodeDurationRowViews(section({ rows: [row(5, 24), row(6, 0, 'not_measured')] }), []);

  it('refuses a number that already has a duration and offers to edit it, allows a listed episode with no value, and hints long above 30 minutes for TV only', () => {
    expect(toEpisodeAddFormView({ episode: '5', minutes: '45' }, rows, true)).toEqual({
      episode: '5', minutes: '45', episodeHint: 'Next after episode 6', duplicateMessage: 'Episode 5 already has 24 min.', duplicateEpisode: 5,
      editInsteadLabel: 'Edit episode 5 instead', isLongHintVisible: true, canAdd: false,
    });
    expect(toEpisodeAddFormView({ episode: '6', minutes: '30' }, rows, true)).toEqual({ episode: '6', minutes: '30', episodeHint: 'Next after episode 6', isLongHintVisible: false, canAdd: true });
    expect(toEpisodeAddFormView({ episode: '7', minutes: '31' }, rows, false).isLongHintVisible).toBe(false);
    expect(toEpisodeAddFormView({ episode: '1', minutes: '' }, [], true)).toEqual({ episode: '1', minutes: '', isLongHintVisible: false, canAdd: false });
    expect(toEpisodeAddFormView({ episode: '0', minutes: '20' }, [], true).canAdd).toBe(false);
  });
});

describe('toEpisodeEditFormView', () => {
  it('titles the modal, names the source, and only applies whole minutes above zero', () => {
    const [view] = toEpisodeDurationRowViews(section({ rows: [row(4, 23)] }), []);

    expect(view === undefined).toBe(false);
    expect(toEpisodeEditFormView({ episode: 4, minutes: '23' }, view!)).toEqual({ title: 'Episode 04 duration', minutes: '23', sourceLine: 'Measured from the file', canApply: true, canClear: true });
    expect(toEpisodeEditFormView({ episode: 4, minutes: '0' }, view!).canApply).toBe(false);
  });
});
