import { describe, expect, it } from 'vitest';
import { ANIME_ESTADO_VALID_VALUES } from '../../../../../shared/constants/anime-estado.constants';
import { computeAnimeEditorListWindow, createAnimeEditorDraft, createAnimeEditorListItems, createAnimeEditorSaveCommand, getAnimeEditorEstadoColor, hasAnimeEditorChanges, isNearListBottom, nextAnimeEditorRenderLimit, premieredDateInputToMs, premieredMsToDateInput, resolveAnimeEditorFeedbackMessage, validateAnimeEditorDraft } from '../anime-editor-workspace.helpers';

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
  it('keeps the orphaned fixed-height windowing helper self-consistent', () => {
    // Dead code retained by a concurrent process; still validated so it can't rot.
    const window = computeAnimeEditorListWindow(0, 0, 800, 56);
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(26);
  });

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

  it('returns field feedback for invalid drafts before save', () => {
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), name: '  ' })).toBe('Name is required.');
    expect(validateAnimeEditorDraft({ ...createAnimeEditorDraft(record), progress: '-1' })).toBe('Watched chapters must be a non-negative number.');
  });

  it('sorts watching anime first in the left rail', () => {
    const items = createAnimeEditorListItems([
      { id: 'b', nombre: 'B', estado: 2, nrocapvisto: 1, activo: 1, dias: [], generos: [], hasDownloadPage: false, hasFolder: false },
      { id: 'a', nombre: 'A', estado: 0, nrocapvisto: 1, activo: 1, dias: [], generos: [], hasDownloadPage: false, hasFolder: false },
    ], 'all', '', 'a');

    expect(items[0]).toMatchObject({ animeId: 'a', selected: true });
  });

  it('normalizes runtime feedback messages to a safe string', () => {
    expect(resolveAnimeEditorFeedbackMessage({ message: 'runtime unavailable' }, 'fallback')).toBe('runtime unavailable');
    expect(resolveAnimeEditorFeedbackMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });
});
