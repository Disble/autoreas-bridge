import { describe, expect, it } from 'vitest';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../../shared/constants/anime-estado.constants';
import { createAnimeEditorDraft, createAnimeEditorListItems, createAnimeEditorSaveCommand, getAnimeEditorEstadoColor, hasAnimeEditorChanges, isNearListBottom, nextAnimeEditorRenderLimit, premieredDateInputToMs, premieredMsToDateInput, resolveAnimeEditorFeedbackMessage, validateAnimeEditorDraft } from '../anime-editor-workspace.helpers';

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

  it('round-trips a premiere date between Unix ms and the date input value', () => {
    const ms = String(Date.parse('2026-04-01T00:00:00.000Z'));
    expect(premieredMsToDateInput(ms)).toBe('2026-04-01');
    expect(premieredDateInputToMs('2026-04-01')).toBe(ms);
  });

  it('treats empty or invalid premiere values as blank', () => {
    expect(premieredMsToDateInput('')).toBe('');
    expect(premieredMsToDateInput('not-a-number')).toBe('');
    expect(premieredDateInputToMs('')).toBe('');
  });

  it('carries the cover source type into the save command when it changes', () => {
    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), coverType: 'image' });
    expect(command.patch.cover).toMatchObject({ present: true, type: 'image' });
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

  it('marks the cover as present and cleared when an existing cover path is emptied', () => {
    const command = createAnimeEditorSaveCommand(record, { ...createAnimeEditorDraft(record), coverPath: '' });
    expect(command.patch.cover).toMatchObject({ present: true, clear: true, path: '' });
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
      { id: 'z', name: 'Zeta', status: 0, episodesWatched: 1, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false },
      { id: 'p', name: 'Paused', status: 3, episodesWatched: 1, active: 1, days: ['Domingo'], genres: [], hasDownloadPage: false, hasFolder: false },
    ], 'all', '', 'p');

    // The paused-but-scheduled anime bubbles above the unscheduled Viendo one.
    expect(items[0]).toMatchObject({ animeId: 'p', selected: true });
    expect(items[1]).toMatchObject({ animeId: 'z' });
  });

  it('shows a paused-but-scheduled anime under "Watching now" and hides unscheduled ones', () => {
    const items = createAnimeEditorListItems([
      { id: 'rezero', name: 'ReZero', status: 3, episodesWatched: 11, active: 1, days: ['Domingo'], genres: [], hasDownloadPage: false, hasFolder: false },
      { id: 'oshi', name: 'Oshi No Ko', status: 1, episodesWatched: 24, active: 1, days: [], genres: [], hasDownloadPage: false, hasFolder: false },
    ], 'watching', '', undefined);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ animeId: 'rezero' });
  });

  it('normalizes runtime feedback messages to a safe string', () => {
    expect(resolveAnimeEditorFeedbackMessage({ message: 'runtime unavailable' }, 'fallback')).toBe('runtime unavailable');
    expect(resolveAnimeEditorFeedbackMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });
});
