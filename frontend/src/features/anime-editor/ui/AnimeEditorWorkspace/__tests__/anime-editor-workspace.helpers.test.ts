import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeCoverEntry } from '../../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import type { AnimeEditorCoverResult, AnimeEditorListItemViewModel } from '../anime-editor-workspace.types';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../../shared/constants/anime-estado.constants';
import { ANIME_EDITOR_CALL_TIMEOUT_MESSAGE } from '../anime-editor-workspace.constants';
import { classifyAnimeEditorEmptyState, createAnimeEditorDraft, createAnimeEditorListItems, createAnimeEditorSaveCommand, getAnimeEditorEstadoColor, hasAnimeEditorChanges, hasSavedAnimeCover, isNearListBottom, nextAnimeEditorRenderLimit, planAnimeEditorCoverRequests, raceAnimeEditorCall, resolveAnimeEditorFeedbackMessage, toAnimeEditorCoverEntry, toAnimeEditorToastKind, toAnimeEditorCoverTargets, toAnimeEditorLifecycleConfirmation, toAnimeEditorListRowViewModels, toEpisodeDurationsSavedAnime, validateAnimeEditorDraft } from '../anime-editor-workspace.helpers';

/** Authority fixture every save-command case edits a draft against. */
const record = {
  animeId: 'anime-1',
  modifiedAt: 100,
  frequent: {
    name: 'Frieren',
    status: 0,
    progress: 12,
    totalEpisodes: 28,
    active: true,
    kind: 1,
    page: 'https://example.com',
    folder: 'D:/anime',
    placements: [],
  },
  details: {
    genres: ['Fantasy'],
    studios: { kind: 'values' as const, values: ['Madhouse'] },
    origin: 'Manga',
    duration: 24,
    cover: { path: 'C:/cover.jpg' },
  },
};

describe('anime-editor-workspace.helpers', () => {
  it('grows the progressive window near the bottom by a batch, capped at the total item count', () => {
    // 200px from the bottom is within the 240px threshold -> load more.
    expect(isNearListBottom(4760, 500, 5460)).toBe(true);
    // 1000px from the bottom is not -> hold.
    expect(isNearListBottom(0, 500, 5460)).toBe(false);
    // Unmeasured geometry counts as "at the bottom" so the first scroll grows.
    expect(isNearListBottom(0, 0, 0)).toBe(true);
    expect(nextAnimeEditorRenderLimit(20, 20, 842)).toBe(40);
    expect(nextAnimeEditorRenderLimit(840, 20, 842)).toBe(842); // never overshoots
  });

  it('maps each canonical estado value to its feature-local semantic color', () => {
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[0])).toBe('accent');
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[1])).toBe('success');
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[2])).toBe('danger');
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[3])).toBe('warning');
    expect(getAnimeEditorEstadoColor(99)).toBe('default');
  });

  it('creates the editable draft from the authoritative record and detects when it diverges', () => {
    const draft = createAnimeEditorDraft(record);
    expect(draft).toMatchObject({
      name: 'Frieren',
      totalEpisodes: '28',
      studios: 'Madhouse',
    });
    expect(hasAnimeEditorChanges(record, draft)).toBe(false);
    expect(hasAnimeEditorChanges(record, { ...draft, name: 'Frieren X' })).toBe(true);
  });

  it('validates the draft duration as a positive whole number of minutes, blank meaning unset', () => {
    const draft = createAnimeEditorDraft(record);
    // Go rejects duration < 1; without this the panel would let the user type a
    // value the backend refuses at save time.
    expect(validateAnimeEditorDraft({ ...draft, duration: '0' })).toBe('Duration must be a positive whole number of minutes.');
    expect(validateAnimeEditorDraft({ ...draft, duration: '0.5' })).toBe('Duration must be a positive whole number of minutes.');
    // parseNullableInteger is load-bearing: Number('abc') < 1 is false, so without
    // this row a non-numeric duration would reach Go and be refused at save time.
    expect(validateAnimeEditorDraft({ ...draft, duration: 'abc' })).toBe('Duration must be a positive whole number of minutes.');
    // The trim is load-bearing: without it a blank string parses to NaN via Number('')
    // === 0, and a mutant that drops the trim would reject an empty duration.
    expect(validateAnimeEditorDraft({ ...draft, duration: '   ' })).toBeUndefined();
    expect(validateAnimeEditorDraft({ ...draft, duration: ' 45 ' })).toBeUndefined();
    expect(validateAnimeEditorDraft({ ...draft, duration: '1' })).toBeUndefined();
    expect(validateAnimeEditorDraft({ ...draft, duration: '' })).toBeUndefined();
  });

  it('returns field feedback for a blank name, negative progress or missing Type before save', () => {
    const draft = createAnimeEditorDraft(record);
    expect(validateAnimeEditorDraft({ ...draft, name: '  ' })).toBe('Name is required.');
    expect(validateAnimeEditorDraft({ ...draft, progress: '-1' })).toBe('Watched episodes must be a non-negative number.');
    // Legacy: Type is mandatory, never optional.
    expect(validateAnimeEditorDraft({ ...draft, kind: '' })).toBe('Type is required.');
    expect(validateAnimeEditorDraft({ ...draft, kind: '2' })).toBeUndefined();
  });

  it('builds an anime-only, changed-fields-only save command: id, base stamp and patch, never episode durations', () => {
    const unchanged = createAnimeEditorSaveCommand(record, createAnimeEditorDraft(record));
    expect(Object.keys(unchanged).sort()).toEqual(['animeId', 'baseModifiedAt', 'patch']);
    expect(unchanged).not.toHaveProperty('episodes');

    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), name: 'Frieren X', studios: 'Madhouse, CloverWorks' });
    expect(command.animeId).toBe('anime-1');
    expect(command.patch.name).toBe('Frieren X');
    expect(command.patch.studios).toEqual(['Madhouse', 'CloverWorks']);

    // toEqual, not toMatchObject: `clear` must stay false here. A cover patch that
    // carries a path while claiming to be a removal is rejected by the backend.
    const coverType = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), coverType: 'image' });
    expect(coverType.patch.cover).toEqual({ present: true, clear: false, type: 'image', path: 'C:/cover.jpg', raw: undefined });
  });

  it('hands the Episodes card the saved record fields, never the unsaved draft, and nothing without a record', () => {
    expect(toEpisodeDurationsSavedAnime(record)).toEqual({
      animeId: record.animeId,
      folder: createAnimeEditorDraft(record).folder,
      totalEpisodes: createAnimeEditorDraft(record).totalEpisodes,
      kind: createAnimeEditorDraft(record).kind,
    });
    expect(toEpisodeDurationsSavedAnime({ ...record, frequent: { ...record.frequent, folder: 'D:/Saved', totalEpisodes: 13, kind: 2 } })).toEqual(
      expect.objectContaining({ folder: 'D:/Saved', totalEpisodes: '13', kind: '2' }),
    );
    expect(toEpisodeDurationsSavedAnime(undefined)).toEqual({ animeId: undefined, folder: '', totalEpisodes: '', kind: '' });
  });

  it('omits unchanged nullable fields, empty or not, so the backend accepts the omission', () => {
    const emptyRecord = {
      ...record,
      frequent: { ...record.frequent, totalEpisodes: undefined, kind: undefined },
      details: { ...record.details, origin: undefined, duration: undefined, cover: undefined },
    };
    const empty = createAnimeEditorSaveCommand(emptyRecord, { ...createAnimeEditorDraft(emptyRecord), kind: '1' });
    expect(empty.patch.totalEpisodes).toEqual({ present: false, clear: false, value: '' });
    expect(empty.patch.origin).toEqual({ present: false, clear: false, value: '' });
    expect(empty.patch.duration).toEqual({ present: false, clear: false, value: '' });
    expect(empty.patch.cover).toEqual({ present: false, clear: false, type: '', path: '', raw: undefined });

    // Unchanged non-empty fields strip their current value.
    const unchanged = createAnimeEditorSaveCommand(record, createAnimeEditorDraft(record));
    expect(unchanged.patch.page).toEqual({ present: false, clear: false, value: '' });
    expect(unchanged.patch.folder).toEqual({ present: false, clear: false, value: '' });
    expect(unchanged.patch.cover).toEqual({ present: false, clear: false, type: '', path: '', raw: undefined });
  });

  it('marks a nullable field or the cover as cleared only when it had a value and the draft empties it', () => {
    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), totalEpisodes: '' });
    expect(command.patch.totalEpisodes).toEqual({ present: true, clear: true, value: '' });

    // toEqual, not toMatchObject: the backend rejects a cleared cover patch that
    // still carries a type, a path, or raw fields ("malformed cleared cover
    // patch"), so leaving those unasserted let a cover become unremovable.
    // Whitespace counts as emptied, which is why the helper trims before deciding.
    for (const coverPath of ['', '   ']) {
      const cleared = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), coverPath });
      expect(cleared.patch.cover).toEqual({ present: true, clear: true, type: '', path: '', raw: undefined });
    }
  });

  it('sorts scheduled anime first in the "All anime" rail, marks only the selected row and carries the cover flag', () => {
    const items = createAnimeEditorListItems([
      { id: 'z', name: 'Zeta', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: true },
      { id: 'p', name: 'Paused', status: 3, episodesWatched: 1, active: 1, days: ['Domingo'], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
    ], 'all', '', 'z');

    // The paused-but-scheduled anime bubbles above the unscheduled Viendo one,
    // regardless of status; only the selected second row is marked.
    expect(items.map((item) => [item.animeId, item.selected, item.hasCover])).toEqual([
      ['p', false, false],
      ['z', true, true],
    ]);
  });

  it('keeps a paused-but-scheduled anime under "Watching now" and only the rows whose status and type were picked', () => {
    const watching = createAnimeEditorListItems([
      { id: 'rezero', name: 'ReZero', status: 3, episodesWatched: 11, active: 1, days: ['Domingo'], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
      { id: 'oshi', name: 'Oshi No Ko', status: 1, episodesWatched: 24, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
    ], 'watching', '', undefined);
    expect(watching).toHaveLength(1);
    expect(watching[0]).toMatchObject({ animeId: 'rezero' });

    const row = { episodesWatched: 1, active: 1, genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false };
    const animes = [
      { ...row, id: 'tv-watching', name: 'A', status: 0, kind: 0, days: ['Lunes'] },
      { ...row, id: 'movie-paused', name: 'B', status: 3, kind: 1, days: [] },
      { ...row, id: 'tv-paused', name: 'C', status: 3, kind: 0, days: ['Martes'] },
      { ...row, id: 'no-kind-paused', name: 'D', status: 3, days: [] },
    ];
    /** Returns the ids the rail keeps for one lens and facet selection. */
    const ids = (filter: 'all' | 'watching', facets: { statuses: string[]; kinds: string[] }) =>
      createAnimeEditorListItems(animes, filter, '', undefined, facets).map((item) => item.animeId);

    expect(ids('all', { statuses: ['3'], kinds: [] })).toEqual(['tv-paused', 'movie-paused', 'no-kind-paused']);
    expect(ids('all', { statuses: [], kinds: ['1'] })).toEqual(['movie-paused']);
    expect(ids('all', { statuses: ['0', '3'], kinds: ['0'] })).toEqual(['tv-watching', 'tv-paused']);
    expect(ids('watching', { statuses: ['3'], kinds: [] })).toEqual(['tv-paused']);
    expect(ids('all', { statuses: [], kinds: [] })).toHaveLength(4);
  });

  it('normalizes runtime feedback messages to a safe string', () => {
    expect(resolveAnimeEditorFeedbackMessage({ message: 'runtime unavailable' }, 'fallback')).toBe('runtime unavailable');
    expect(resolveAnimeEditorFeedbackMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });

  it.each([
    ['applied', 'success'],
    ['no_op', 'info'],
    ['conflict', 'warning'],
    ['error', 'danger'],
  ] as const)('reports a %s outcome as a %s toast', (outcome, kind) => {
    expect(toAnimeEditorToastKind(outcome)).toBe(kind);
  });
});

describe('toAnimeEditorLifecycleConfirmation', () => {
  it('returns the destructive Deactivate copy byte-identical to the modal and non-destructive Restore and Repeat copy', () => {
    // toEqual, not toMatchObject: the generalized confirm modal renders this
    // copy verbatim, so an extra or missing field would silently reach the UI.
    expect(toAnimeEditorLifecycleConfirmation('deactivate')).toEqual({
      action: 'deactivate',
      heading: 'Deactivate anime',
      description: 'This hides the anime from your active library. You can restore it later from History.',
      confirmLabel: 'Deactivate',
      isDestructive: true,
    });

    for (const [action, confirmLabel] of [['restore', 'Restore'], ['repeat', 'Repeat']] as const) {
      const confirmation = toAnimeEditorLifecycleConfirmation(action);
      expect(confirmation.action).toBe(action);
      expect(confirmation.isDestructive).toBe(false);
      expect(confirmation.confirmLabel).toBe(confirmLabel);
      expect(confirmation.heading.length).toBeGreaterThan(0);
      expect(confirmation.description.length).toBeGreaterThan(0);
    }
  });
});

describe('classifyAnimeEditorEmptyState', () => {
  /** Baseline: a resolved library holding rows, with no criteria narrowing it. */
  const resolved = { isLoadingList: false, sourceCount: 3, visibleCount: 3, hasActiveCriteria: false } as const;

  it('classifies unresolved and visible rows as none, a resolved empty library as actual and zero rows under criteria as criteria', () => {
    // Nothing while the library request is unresolved.
    expect(classifyAnimeEditorEmptyState({ ...resolved, isLoadingList: true, sourceCount: 0, visibleCount: 0 })).toBe('none');
    expect(classifyAnimeEditorEmptyState({ ...resolved, sourceCount: 0, visibleCount: 0 })).toBe('actual');
    expect(classifyAnimeEditorEmptyState(resolved)).toBe('none');
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 0, hasActiveCriteria: true })).toBe('criteria');
    // Zero visible rows are not criteria-empty when no criteria are active.
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 0 })).toBe('none');
    // Visible rows stay out of every empty state even under a search or a non-default filter.
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 1, hasActiveCriteria: true })).toBe('none');
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 2, hasActiveCriteria: true })).toBe('none');
  });
});

describe('cover projection', () => {
  /** Builds one rail row carrying only the fields the cover helpers read. */
  function row(animeId: string, hasCover: boolean): AnimeEditorListItemViewModel {
    return { id: animeId, animeId, nombre: animeId, subtitle: '1 watched', selected: false, hasCover };
  }

  /** Builds one saved editor record, optionally carrying a stored cover source. */
  function savedRecord(coverPath?: string, animeId = 'anime-1'): AnimeEditorRecord {
    return {
      animeId,
      modifiedAt: 1,
      frequent: { name: animeId, status: 0, progress: 1, active: true, placements: [] },
      details: {
        genres: [],
        studios: { kind: 'values', values: [] },
        cover: coverPath === undefined ? undefined : { path: coverPath },
      },
    };
  }

  it.each<[string, string | undefined, boolean]>([
    ['a URL cover', 'https://example.com/cover.jpg', true],
    ['a local Windows cover path', 'D:/covers/frieren.jpg', true],
    ['a blank path', '', false],
    ['a whitespace-only path', '   ', false],
    ['a literal null sentinel', 'null', false],
    ['an absent cover', undefined, false],
  ])('reads %s as saved=%s', (_label, coverPath, expected) => {
    expect(hasSavedAnimeCover(savedRecord(coverPath))).toBe(expected);
  });

  it('reports no saved cover before any record has loaded', () => {
    expect(hasSavedAnimeCover(undefined)).toBe(false);
  });

  it('targets the window rows plus the selected record, by its saved source and never past a cleared cover', () => {
    // The progressive window rows and nothing past it.
    expect(toAnimeEditorCoverTargets([row('a', true), row('b', false), row('c', true)], 2, undefined)).toEqual([
      { animeId: 'a', hasCover: true },
      { animeId: 'b', hasCover: false },
    ]);
    // The selected saved record stays resolvable outside the window.
    expect(toAnimeEditorCoverTargets([row('a', true)], 1, savedRecord('https://c.jpg', 'z'))).toEqual([
      { animeId: 'a', hasCover: true },
      { animeId: 'z', hasCover: true, coverVersion: 'https://c.jpg' },
    ]);
    // The record's saved source replaces the row's presence-only answer without
    // duplicating it, which is what lets a later A->B save be detectable at all.
    expect(toAnimeEditorCoverTargets([row('a', true)], 1, savedRecord('https://c.jpg', 'a'))).toEqual([{ animeId: 'a', hasCover: true, coverVersion: 'https://c.jpg' }]);
    // A cleared saved cover drops to the placeholder even while the list still reports one.
    expect(toAnimeEditorCoverTargets([row('a', true)], 1, savedRecord(undefined, 'a'))).toEqual([{ animeId: 'a', hasCover: false }]);
    expect(toAnimeEditorCoverTargets([], 0, savedRecord(undefined, 'z'))).toEqual([{ animeId: 'z', hasCover: false }]);
    // A local Windows cover path is reported as the row version.
    expect(toAnimeEditorCoverTargets([], 0, savedRecord('D:/covers/frieren.jpg', 'z'))).toEqual([{ animeId: 'z', hasCover: true, coverVersion: 'D:/covers/frieren.jpg' }]);
  });

  it.each<[string, AnimeEditorCoverResult, AnimeCoverEntry]>([
    ['a resolved thumbnail', { source: 'cover', dataUrl: 'data:image/jpeg;base64,x' }, { status: 'cover', dataUrl: 'data:image/jpeg;base64,x' }],
    ['the placeholder signal', { source: 'placeholder', dataUrl: 'data:image/jpeg;base64,x' }, { status: 'placeholder' }],
    ['a cover result with no bytes', { source: 'cover' }, { status: 'placeholder' }],
  ])('maps %s into its cache entry', (_label, result, expected) => {
    expect(toAnimeEditorCoverEntry(result)).toEqual(expected);
  });

  it('joins each resolved cover onto its own row and leaves unresolved or DTO-coverless rows on the placeholder', () => {
    expect(toAnimeEditorListRowViewModels([row('a', true)], new Map())).toEqual([{ ...row('a', true), cover: { status: 'placeholder' } }]);

    const rows = toAnimeEditorListRowViewModels(
      [row('a', true), row('b', true)],
      new Map([['b', { status: 'cover', dataUrl: 'data:image/jpeg;base64,b' }]]),
    );
    expect(rows.map((item) => item.cover)).toEqual([
      { status: 'placeholder' },
      { status: 'cover', dataUrl: 'data:image/jpeg;base64,b' },
    ]);

    // The removal path: the list reloaded with `hasCover: false` while the
    // cache still carried the art resolved before the cover was cleared.
    const removed = toAnimeEditorListRowViewModels([row('a', false)], new Map([['a', { status: 'cover', dataUrl: 'data:image/jpeg;base64,old' }]]));
    expect(removed.map((item) => item.cover)).toEqual([{ status: 'placeholder' }]);
  });
});

describe('cover request planning', () => {
  const NOT_REQUESTED: ReadonlyMap<string, string | undefined> = new Map();

  /** Builds one cover target: presence, plus the saved source when the rail knows it. */
  function target(hasCover: boolean, coverVersion?: string) {
    return coverVersion === undefined ? { animeId: 'anime-1', hasCover } : { animeId: 'anime-1', hasCover, coverVersion };
  }

  it.each<[string, ReturnType<typeof target>, ReadonlyMap<string, string | undefined>, readonly string[], readonly string[], readonly (readonly [string, string | undefined])[]]>([
    ['a first presence-only row lookup', target(true), NOT_REQUESTED, ['anime-1'], [], [['anime-1', undefined]]],
    ['no second lookup for an unchanged presence-only row', target(true), new Map([['anime-1', undefined]]), [], [], [['anime-1', undefined]]],
    ['a first lookup of a known saved source', target(true, 'A'), NOT_REQUESTED, ['anime-1'], [], [['anime-1', 'A']]],
    ['no second lookup for the same saved source', target(true, 'A'), new Map([['anime-1', 'A']]), [], [], [['anime-1', 'A']]],
    ['a fresh lookup when the saved source changed A to B', target(true, 'B'), new Map([['anime-1', 'A']]), ['anime-1'], [], [['anime-1', 'B']]],
    ['no lookup when the saved source merely becomes known', target(true, 'A'), new Map([['anime-1', undefined]]), [], [], [['anime-1', 'A']]],
    ['no lookup when the saved source becomes unknown again', target(true), new Map([['anime-1', 'A']]), [], [], [['anime-1', 'A']]],
    ['an invalidation, forgetting the source, when the cover is gone', target(false), new Map([['anime-1', 'A']]), [], ['anime-1'], []],
    ['an invalidation for a coverless row that was never looked up', target(false), NOT_REQUESTED, [], ['anime-1'], []],
  ])('plans %s', (_label, coverTarget, requestedVersions, requests, invalidatedIds, versions) => {
    const plan = planAnimeEditorCoverRequests([coverTarget], requestedVersions);

    expect(plan.requests).toEqual(requests);
    expect(plan.invalidatedIds).toEqual(invalidatedIds);
    expect([...plan.requestedVersions]).toEqual(versions);
  });

  it('looks the anime up again once a cover comes back after an invalidation, leaving the other remembered sources untouched', () => {
    const removal = planAnimeEditorCoverRequests([target(false)], new Map([['anime-1', 'A']]));
    expect(planAnimeEditorCoverRequests([target(true, 'A')], removal.requestedVersions).requests).toEqual(['anime-1']);

    const plan = planAnimeEditorCoverRequests([target(true, 'B')], new Map([['anime-1', 'A'], ['anime-2', 'X']]));
    expect([...plan.requestedVersions]).toEqual([['anime-1', 'B'], ['anime-2', 'X']]);
  });
});

describe('raceAnimeEditorCall', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['resolves with the binding result', () => Promise.resolve('done'), 'done'],
    ['rejects with the binding error', () => Promise.reject(new Error('boom')), 'boom'],
  ])('%s and leaves no timer behind', async (_label, call, expected) => {
    vi.useFakeTimers();

    const settled = await raceAnimeEditorCall(call(), 1000).then(String, (error: Error) => error.message);

    expect(settled).toBe(expected);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with the timeout feedback once the call outlives the limit', async () => {
    vi.useFakeTimers();
    const outcome = expect(raceAnimeEditorCall(new Promise(() => undefined), 1000)).rejects.toThrow(ANIME_EDITOR_CALL_TIMEOUT_MESSAGE);

    await vi.advanceTimersByTimeAsync(1000);

    await outcome;
  });
});
