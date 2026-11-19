import { describe, expect, it } from 'vitest';
import type { AnimeEditorRecord, AnimeEditorScheduleBoard, AnimeEditorScheduleBoardEntry, AnimeSchedulePlacement } from '../../../../../shared/contracts/anime.types';
import { toAnimeScheduleBoardLoad, toAnimeScheduleDays, toAnimeScheduleSavedPlacements, toAnimeScheduleWeekView } from '../anime-schedule-card.helpers';

/**
 * Builds one board entry.
 * @param animeId The anime.
 * @param placements Its placements.
 * @returns The entry.
 */
function entry(animeId: string, placements: readonly AnimeSchedulePlacement[]): AnimeEditorScheduleBoardEntry {
  return { animeId, name: animeId, active: true, modifiedAt: 1, placements, status: 0, progress: 0, originHighlighted: false };
}

/** Lunes, Martes and Jueves weekdays plus two season sections, as the backend sends them. */
const DESTINATIONS = [
  { id: 'Lunes', label: 'Lunes', kind: 'weekday' as const },
  { id: 'Martes', label: 'Martes', kind: 'weekday' as const },
  { id: 'Sin ver', label: 'Sin ver', kind: 'special' as const },
  { id: 'Jueves', label: 'Jueves', kind: 'weekday' as const },
  { id: 'Ver hoy', label: 'Ver hoy', kind: 'special' as const },
];

/**
 * Builds a board whose origin may differ from the selected anime, like the board an apply returns.
 * @param entries The entries.
 * @returns The board.
 */
function board(entries: readonly AnimeEditorScheduleBoardEntry[]): AnimeEditorScheduleBoard {
  return { originAnimeId: '', boardModifiedAt: 1, destinations: DESTINATIONS, entries };
}

/**
 * Builds the saved editor record of one anime with its own placements.
 * @param animeId The anime.
 * @param placements Its saved placements.
 * @returns The record.
 */
function record(animeId: string, placements: readonly AnimeSchedulePlacement[]): AnimeEditorRecord {
  return {
    animeId,
    modifiedAt: 1,
    frequent: { name: animeId, status: 0, progress: 0, active: false, placements },
    details: { genres: [], studios: { kind: 'missing', values: [] } },
  };
}

describe('toAnimeScheduleDays', () => {
  it('gives one cell per weekday, ranks the selected anime by normalized order at its first place, and counts that day', () => {
    const days = toAnimeScheduleDays(board([
      entry('a', [{ day: 'Lunes', order: 10 }]),
      entry('me', [{ day: 'Lunes', order: 30 }, { day: 'Martes', order: 2 }]),
      entry('b', [{ day: 'Lunes', order: 20 }, { day: 'Sin ver', order: 1 }]),
      entry('c', [{ day: 'Martes', order: 5 }]),
    ]), 'me', 'weekday', []);

    expect(days).toEqual([
      { id: 'Lunes', label: 'Lunes', isScheduled: true, position: { order: 3, total: 3 }, ariaLabel: 'Lunes: 3 of 3' },
      { id: 'Martes', label: 'Martes', isScheduled: true, position: { order: 1, total: 2 }, ariaLabel: 'Martes: 1 of 2' },
      { id: 'Jueves', label: 'Jueves', isScheduled: false, ariaLabel: 'Jueves: not scheduled' },
    ]);

    // An anime placed twice on one day counts once, at its first place.
    const twice = toAnimeScheduleDays(board([
      entry('me', [{ day: 'Lunes', order: 4 }, { day: 'Lunes', order: 1 }]),
      entry('a', [{ day: 'Lunes', order: 2 }]),
    ]), 'me', 'weekday', []);
    expect(twice[0]).toEqual({ id: 'Lunes', label: 'Lunes', isScheduled: true, position: { order: 1, total: 2 }, ariaLabel: 'Lunes: 1 of 2' });

    // Animes that share one order value keep board order.
    const tied = toAnimeScheduleDays(board([
      entry('a', [{ day: 'Lunes', order: 1 }]),
      entry('me', [{ day: 'Lunes', order: 1 }]),
    ]), 'me', 'weekday', []);
    expect(tied[0]?.position).toEqual({ order: 2, total: 2 });
  });

  it('gives one cell per season section, ranked the same way, painting saved days off the board unranked and trusting the board over them', () => {
    const days = toAnimeScheduleDays(board([
      entry('a', [{ day: 'Ver hoy', order: 1 }]),
      entry('me', [{ day: 'Ver hoy', order: 2 }]),
    ]), 'me', 'special', []);

    expect(days).toEqual([
      { id: 'Sin ver', label: 'Sin ver', isScheduled: false, ariaLabel: 'Sin ver: not scheduled' },
      { id: 'Ver hoy', label: 'Ver hoy', isScheduled: true, position: { order: 2, total: 2 }, ariaLabel: 'Ver hoy: 2 of 2' },
    ]);

    // The saved days of an anime off the board are painted without a place, since it is not ranked.
    const offBoard = toAnimeScheduleDays(board([entry('a', [{ day: 'Sin ver', order: 1 }])]), 'me', 'special', [{ day: 'Sin ver', order: 3 }]);
    expect(offBoard).toEqual([
      { id: 'Sin ver', label: 'Sin ver', isScheduled: true, ariaLabel: 'Sin ver: scheduled' },
      { id: 'Ver hoy', label: 'Ver hoy', isScheduled: false, ariaLabel: 'Ver hoy: not scheduled' },
    ]);

    // For an anime on the board, the board wins over the saved days.
    const onBoard = toAnimeScheduleDays(board([entry('me', [{ day: 'Ver hoy', order: 1 }])]), 'me', 'special', [{ day: 'Sin ver', order: 1 }]);
    expect(onBoard.map((day) => day.ariaLabel)).toEqual(['Sin ver: not scheduled', 'Ver hoy: 1 of 1']);
  });
});

describe('toAnimeScheduleSavedPlacements', () => {
  it('reads the saved placements of the selected anime only', () => {
    const saved = record('me', [{ day: 'Visto', order: 2 }]);

    expect(toAnimeScheduleSavedPlacements(saved, 'me')).toEqual([{ day: 'Visto', order: 2 }]);
    expect(toAnimeScheduleSavedPlacements(saved, 'other')).toEqual([]);
    expect(toAnimeScheduleSavedPlacements(undefined, 'me')).toEqual([]);
  });
});

describe('toAnimeScheduleWeekView', () => {
  it('serves the weekdays and season sections of a read board, the saved days the board leaves out, and no days until it is read', () => {
    const view = toAnimeScheduleWeekView({ status: 'ready', board: board([entry('me', [{ day: 'Jueves', order: 1 }])]) }, 'me', [{ day: 'Ver hoy', order: 1 }]);

    expect(view.status).toBe('ready');
    expect(view.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: not scheduled', 'Jueves: 1 of 1']);
    expect(view.seasonDays.map((day) => day.ariaLabel)).toEqual(['Sin ver: not scheduled', 'Ver hoy: not scheduled']);
    expect(view.failureMessage).toBeUndefined();

    // The saved days of an anime the board leaves out.
    const leftOut = toAnimeScheduleWeekView({ status: 'ready', board: board([]) }, 'me', [{ day: 'Ver hoy', order: 1 }]);
    expect(leftOut.seasonDays.map((day) => day.ariaLabel)).toEqual(['Sin ver: not scheduled', 'Ver hoy: scheduled']);

    // No days while idle, loading or failed, and the failure message.
    expect(toAnimeScheduleWeekView({ status: 'idle' }, 'me', [])).toEqual({ status: 'idle', days: [], seasonDays: [] });
    expect(toAnimeScheduleWeekView({ status: 'loading' }, 'me', [])).toEqual({ status: 'loading', days: [], seasonDays: [] });
    expect(toAnimeScheduleWeekView({ status: 'failed', message: 'offline', board: board([]) }, 'me', [])).toEqual({ status: 'failed', days: [], seasonDays: [], failureMessage: 'offline' });
  });
});

describe('toAnimeScheduleBoardLoad', () => {
  it('reads a loaded board as ready, an error as failed with its message and fallback board, and a missing board as failed generically', () => {
    const loaded = board([]);
    expect(toAnimeScheduleBoardLoad({ outcome: 'applied', message: 'loaded', board: loaded })).toEqual({ status: 'ready', board: loaded });
    const fallback = board([]);
    expect(toAnimeScheduleBoardLoad({ outcome: 'error', message: 'runtime unavailable', board: fallback })).toEqual({ status: 'failed', message: 'runtime unavailable', board: fallback });

    expect(toAnimeScheduleBoardLoad({ outcome: 'applied', message: '' })).toEqual({ status: 'failed', message: 'The schedule board could not be loaded.' });
    expect(toAnimeScheduleBoardLoad({ outcome: 'error', message: 'offline' }).board).toBeUndefined();
  });
});
