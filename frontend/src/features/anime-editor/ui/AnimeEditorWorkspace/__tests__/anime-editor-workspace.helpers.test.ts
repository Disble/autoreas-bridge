import { describe, expect, it } from 'vitest';
import type { AnimeCoverEntry } from '../../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import type { AnimeEditorCoverResult, AnimeEditorListItemViewModel } from '../anime-editor-workspace.types';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../../shared/constants/anime-estado.constants';
import { classifyAnimeEditorEmptyState, createAnimeEditorDraft, createAnimeEditorListItems, createAnimeEditorSaveCommand, getAnimeEditorEstadoColor, hasAnimeEditorChanges, hasSavedAnimeCover, isNearListBottom, nextAnimeEditorRenderLimit, planAnimeEditorCoverRequests, resolveAnimeEditorFeedbackMessage, toAnimeEditorCoverEntry, toAnimeEditorCoverTargets, toAnimeEditorLifecycleConfirmation, toAnimeEditorListRowViewModels, validateAnimeEditorDraft } from '../anime-editor-workspace.helpers';

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
  it('detects when the scroll position is near the bottom (append trigger)', () => {
    // 200px from the bottom is within the 240px threshold -> load more.
    expect(isNearListBottom(4760, 500, 5460)).toBe(true);
    // 1000px from the bottom is not -> hold.
    expect(isNearListBottom(0, 500, 5460)).toBe(false);
    // Unmeasured geometry counts as "at the bottom" so the first scroll grows.
    expect(isNearListBottom(0, 0, 0)).toBe(true);
  });

  it('grows the render limit by a batch, capped at the total item count', () => {
    expect(nextAnimeEditorRenderLimit(20, 20, 842)).toBe(40);
    expect(nextAnimeEditorRenderLimit(840, 20, 842)).toBe(842); // never overshoots
  });

  it('carries the cover source type into the save command when it changes', () => {
    // toEqual, not toMatchObject: `clear` must stay false here. A cover patch that
    // carries a path while claiming to be a removal is rejected by the backend.
    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), coverType: 'image' });
    expect(command.patch.cover).toEqual({ present: true, clear: false, type: 'image', path: 'C:/cover.jpg', raw: undefined });
  });

  it('maps each canonical estado value to its feature-local semantic color', () => {
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[0])).toBe('accent');
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[1])).toBe('success');
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[2])).toBe('danger');
    expect(getAnimeEditorEstadoColor(ANIME_ESTADO_VALID_VALUES[3])).toBe('warning');
    expect(getAnimeEditorEstadoColor(99)).toBe('default');
  });

  it('creates the editable draft from the authoritative record', () => {
    expect(createAnimeEditorDraft(record)).toMatchObject({
      name: 'Frieren',
      totalEpisodes: '28',
      studios: 'Madhouse',
    });
  });

  it('detects when the draft diverges from authority', () => {
    const draft = createAnimeEditorDraft(record);
    expect(hasAnimeEditorChanges(record, draft)).toBe(false);
    expect(hasAnimeEditorChanges(record, { ...draft, name: 'Frieren X' })).toBe(true);
  });

  it('rejects a zero or fractional duration so Go and the panel agree on the minimum', () => {
    // Go rejects duration < 1; without this the panel would let the user type a
    // value the backend refuses at save time.
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), duration: '0' })).toBe('Duration must be a positive whole number of minutes.');
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), duration: '0.5' })).toBe('Duration must be a positive whole number of minutes.');
  });

  it('treats a whitespace-only duration as unset and parses a padded number', () => {
    // The trim is load-bearing: without it a blank string parses to NaN via Number('')
    // === 0, and a mutant that drops the trim would reject an empty duration.
    const draft = { ...createAnimeEditorDraft(record), duration: '   ' };
    expect(validateAnimeEditorDraft(draft)).toBeUndefined();
    expect(validateAnimeEditorDraft({ ...draft, duration: ' 45 ' })).toBeUndefined();
  });

  it('rejects a duration that is not a whole number', () => {
    // parseNullableInteger is load-bearing: Number('abc') < 1 is false, so without
    // this row a non-numeric duration would reach Go and be refused at save time.
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), duration: 'abc' })).toBe('Duration must be a positive whole number of minutes.');
  });

  it('accepts one minute and leaves an unset duration alone', () => {
    const draft = { ...createAnimeEditorDraft(record), duration: '1' };
    expect(validateAnimeEditorDraft(draft)).toBeUndefined();
    expect(validateAnimeEditorDraft({ ...draft, duration: '' })).toBeUndefined();
  });

  it('builds a changed-fields-only save command', () => {
    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), name: 'Frieren X', studios: 'Madhouse, CloverWorks' });
    expect(command.animeId).toBe('anime-1');
    expect(command.patch.name).toBe('Frieren X');
    expect(command.patch.studios).toEqual(['Madhouse', 'CloverWorks']);
  });

  it('omits empty unchanged nullable fields instead of marking them as cleared', () => {
    const emptyRecord = {
      ...record,
      frequent: { ...record.frequent, totalEpisodes: undefined, kind: undefined },
      details: { ...record.details, origin: undefined, duration: undefined, cover: undefined },
    };
    const draft = { ...createAnimeEditorDraft(emptyRecord), kind: '1' };
    const command = createAnimeEditorSaveCommand(emptyRecord, draft);
    expect(command.patch.totalEpisodes).toEqual({ present: false, clear: false, value: '' });
    expect(command.patch.origin).toEqual({ present: false, clear: false, value: '' });
    expect(command.patch.duration).toEqual({ present: false, clear: false, value: '' });
    expect(command.patch.cover).toEqual({ present: false, clear: false, type: '', path: '', raw: undefined });
  });

  it('strips the current value from unchanged non-empty nullable fields so the backend accepts the omission', () => {
    const unchangedDraft = createAnimeEditorDraft(record);
    const command = createAnimeEditorSaveCommand(record, unchangedDraft);
    expect(command.patch.page).toEqual({ present: false, clear: false, value: '' });
    expect(command.patch.folder).toEqual({ present: false, clear: false, value: '' });
    expect(command.patch.cover).toEqual({ present: false, clear: false, type: '', path: '', raw: undefined });
  });

  it('marks a nullable field as cleared only when it had a value and the draft is empty', () => {
    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), totalEpisodes: '' });
    expect(command.patch.totalEpisodes).toEqual({ present: true, clear: true, value: '' });
  });

  it('emits the canonical cleared cover patch when an existing cover path is emptied', () => {
    // toEqual, not toMatchObject: the backend rejects a cleared cover patch that
    // still carries a type, a path, or raw fields ("malformed cleared cover
    // patch"), so leaving those unasserted let a cover become unremovable.
    // Whitespace counts as emptied, which is why the helper trims before deciding.
    for (const coverPath of ['', '   ']) {
      const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), coverPath });
      expect(command.patch.cover).toEqual({ present: true, clear: true, type: '', path: '', raw: undefined });
    }
  });

  it('returns field feedback for invalid drafts before save', () => {
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), name: '  ' })).toBe('Name is required.');
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), progress: '-1' })).toBe('Watched episodes must be a non-negative number.');
  });

  it('requires a Type before any save (Legacy: Type is mandatory, never optional)', () => {
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), kind: '' })).toBe('Type is required.');
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), kind: '2' })).toBeUndefined();
  });

  it('sorts scheduled (Daily-board) anime first in the "All anime" rail regardless of status', () => {
    const items = createAnimeEditorListItems([
      { id: 'z', name: 'Zeta', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
      { id: 'p', name: 'Paused', status: 3, episodesWatched: 1, active: 1, days: ['Domingo'], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
    ], 'all', '', 'p');

    // The paused-but-scheduled anime bubbles above the unscheduled Viendo one.
    expect(items[0]).toMatchObject({ animeId: 'p', selected: true });
    expect(items[1]).toMatchObject({ animeId: 'z' });
  });

  it('marks only the row whose id was selected, leaving every other row unselected', () => {
    const items = createAnimeEditorListItems([
      { id: 'a', name: 'A', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
      { id: 'b', name: 'B', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
    ], 'all', '', 'b');

    expect(items.map((item) => [item.animeId, item.selected])).toEqual([['a', false], ['b', true]]);
  });

  it('shows a paused-but-scheduled anime under "Watching now" and hides unscheduled ones', () => {
    const items = createAnimeEditorListItems([
      { id: 'rezero', name: 'ReZero', status: 3, episodesWatched: 11, active: 1, days: ['Domingo'], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
      { id: 'oshi', name: 'Oshi No Ko', status: 1, episodesWatched: 24, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
    ], 'watching', '', undefined);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ animeId: 'rezero' });
  });

  it('normalizes runtime feedback messages to a safe string', () => {
    expect(resolveAnimeEditorFeedbackMessage({ message: 'runtime unavailable' }, 'fallback')).toBe('runtime unavailable');
    expect(resolveAnimeEditorFeedbackMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });
});

describe('toAnimeEditorLifecycleConfirmation', () => {
  it('returns the current Deactivate copy byte-identical to the existing modal', () => {
    // toEqual, not toMatchObject: the generalized confirm modal renders this
    // copy verbatim, so an extra or missing field would silently reach the UI.
    expect(toAnimeEditorLifecycleConfirmation('deactivate')).toEqual({
      action: 'deactivate',
      heading: 'Deactivate anime',
      description: 'This hides the anime from your active library. You can restore it later from History.',
      confirmLabel: 'Deactivate',
      isDestructive: true,
    });
  });

  it('returns non-destructive Restore copy', () => {
    const confirmation = toAnimeEditorLifecycleConfirmation('restore');
    expect(confirmation.action).toBe('restore');
    expect(confirmation.isDestructive).toBe(false);
    expect(confirmation.confirmLabel).toBe('Restore');
    expect(confirmation.heading.length).toBeGreaterThan(0);
    expect(confirmation.description.length).toBeGreaterThan(0);
  });

  it('returns non-destructive Repeat copy', () => {
    const confirmation = toAnimeEditorLifecycleConfirmation('repeat');
    expect(confirmation.action).toBe('repeat');
    expect(confirmation.isDestructive).toBe(false);
    expect(confirmation.confirmLabel).toBe('Repeat');
    expect(confirmation.heading.length).toBeGreaterThan(0);
    expect(confirmation.description.length).toBeGreaterThan(0);
  });
});

describe('classifyAnimeEditorEmptyState', () => {
  /** Baseline: a resolved library holding rows, with no criteria narrowing it. */
  const resolved = { isLoadingList: false, sourceCount: 3, visibleCount: 3, query: '', filter: 'all' } as const;

  it('classifies nothing while the library request is unresolved', () => {
    expect(classifyAnimeEditorEmptyState({ ...resolved, isLoadingList: true, sourceCount: 0, visibleCount: 0 })).toBe('none');
  });

  it('classifies a resolved library with no stored anime as actually empty', () => {
    expect(classifyAnimeEditorEmptyState({ ...resolved, sourceCount: 0, visibleCount: 0 })).toBe('actual');
  });

  it('classifies visible rows as not empty at all', () => {
    expect(classifyAnimeEditorEmptyState(resolved)).toBe('none');
  });

  it('classifies zero visible rows under an active search as criteria-empty', () => {
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 0, query: 'frieren' })).toBe('criteria');
  });

  it('classifies zero visible rows under a non-default filter as criteria-empty', () => {
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 0, filter: 'watching' })).toBe('criteria');
  });

  it('refuses to call zero visible rows criteria-empty when no criteria are active', () => {
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 0 })).toBe('none');
  });

  it('treats a whitespace-only search as no search at all', () => {
    expect(classifyAnimeEditorEmptyState({ ...resolved, visibleCount: 0, query: '   ' })).toBe('none');
  });
});

describe('classifyAnimeEditorEmptyState with visible rows', () => {
  it('keeps visible rows out of every empty state even while a search is active', () => {
    expect(classifyAnimeEditorEmptyState({ isLoadingList: false, sourceCount: 3, visibleCount: 1, query: 'frieren', filter: 'all' })).toBe('none');
  });

  it('keeps visible rows out of every empty state even under a non-default filter', () => {
    expect(classifyAnimeEditorEmptyState({ isLoadingList: false, sourceCount: 3, visibleCount: 2, query: '', filter: 'watching' })).toBe('none');
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

  it('carries the backend cover-presence flag onto each rail row', () => {
    const items = createAnimeEditorListItems([
      { id: 'a', name: 'A', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: true },
      { id: 'b', name: 'B', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false, hasCover: false },
    ], 'all', '', undefined);

    expect(items.map((item) => [item.animeId, item.hasCover])).toEqual([['a', true], ['b', false]]);
  });

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

  it('targets the progressive window rows and nothing past it', () => {
    const items = [row('a', true), row('b', false), row('c', true)];

    expect(toAnimeEditorCoverTargets(items, 2, undefined)).toEqual([
      { animeId: 'a', hasCover: true },
      { animeId: 'b', hasCover: false },
    ]);
  });

  it('keeps the selected saved record resolvable when it falls outside the window', () => {
    const targets = toAnimeEditorCoverTargets([row('a', true)], 1, savedRecord('https://c.jpg', 'z'));

    expect(targets).toEqual([
      { animeId: 'a', hasCover: true },
      { animeId: 'z', hasCover: true, coverVersion: 'https://c.jpg' },
    ]);
  });

  it('adds the selected record without duplicating or downgrading its window row', () => {
    const targets = toAnimeEditorCoverTargets([row('a', true)], 1, savedRecord('https://c.jpg', 'a'));

    // The record's saved source replaces the row's presence-only answer, which
    // is what lets a later A->B save be detectable at all.
    expect(targets).toEqual([{ animeId: 'a', hasCover: true, coverVersion: 'https://c.jpg' }]);
  });

  it('drops the selected record to the placeholder once its saved cover is cleared, even while the list still reports one', () => {
    const targets = toAnimeEditorCoverTargets([row('a', true)], 1, savedRecord(undefined, 'a'));

    expect(targets).toEqual([{ animeId: 'a', hasCover: false }]);
  });

  it('never widens the window for a selected record whose saved cover is gone', () => {
    const targets = toAnimeEditorCoverTargets([], 0, savedRecord(undefined, 'z'));

    expect(targets).toEqual([{ animeId: 'z', hasCover: false }]);
  });

  it('reports the saved source of a local Windows cover path as the row version', () => {
    const targets = toAnimeEditorCoverTargets([], 0, savedRecord('D:/covers/frieren.jpg', 'z'));

    expect(targets).toEqual([{ animeId: 'z', hasCover: true, coverVersion: 'D:/covers/frieren.jpg' }]);
  });

  it.each<[string, AnimeEditorCoverResult, AnimeCoverEntry]>([
    ['a resolved thumbnail', { source: 'cover', dataUrl: 'data:image/jpeg;base64,x' }, { status: 'cover', dataUrl: 'data:image/jpeg;base64,x' }],
    ['the placeholder signal', { source: 'placeholder', dataUrl: 'data:image/jpeg;base64,x' }, { status: 'placeholder' }],
    ['a cover result with no bytes', { source: 'cover' }, { status: 'placeholder' }],
  ])('maps %s into its cache entry', (_label, result, expected) => {
    expect(toAnimeEditorCoverEntry(result)).toEqual(expected);
  });

  it('leaves a row whose cover is unresolved on the placeholder', () => {
    const rows = toAnimeEditorListRowViewModels([row('a', true)], new Map());

    expect(rows).toEqual([{ ...row('a', true), cover: { status: 'placeholder' } }]);
  });

  it('joins each resolved cover onto its own row', () => {
    const rows = toAnimeEditorListRowViewModels(
      [row('a', true), row('b', true)],
      new Map([['b', { status: 'cover', dataUrl: 'data:image/jpeg;base64,b' }]]),
    );

    expect(rows.map((item) => item.cover)).toEqual([
      { status: 'placeholder' },
      { status: 'cover', dataUrl: 'data:image/jpeg;base64,b' },
    ]);
  });

  it('keeps a row the DTO reports as coverless on the placeholder even while the cache still holds its old art', () => {
    // The removal path: the list reloaded with `hasCover: false` while the
    // cache still carried the art resolved before the cover was cleared.
    const rows = toAnimeEditorListRowViewModels([row('a', false)], new Map([['a', { status: 'cover', dataUrl: 'data:image/jpeg;base64,old' }]]));

    expect(rows.map((item) => item.cover)).toEqual([{ status: 'placeholder' }]);
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

  it('looks the anime up again once a cover comes back after an invalidation', () => {
    const removal = planAnimeEditorCoverRequests([target(false)], new Map([['anime-1', 'A']]));

    expect(planAnimeEditorCoverRequests([target(true, 'A')], removal.requestedVersions).requests).toEqual(['anime-1']);
  });

  it('leaves the remembered source untouched for the other animes in the plan', () => {
    const plan = planAnimeEditorCoverRequests([target(true, 'B')], new Map([['anime-1', 'A'], ['anime-2', 'X']]));

    expect([...plan.requestedVersions]).toEqual([['anime-1', 'B'], ['anime-2', 'X']]);
  });
});
