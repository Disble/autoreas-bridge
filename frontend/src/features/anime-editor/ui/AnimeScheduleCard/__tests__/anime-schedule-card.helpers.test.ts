import { describe, expect, it } from 'vitest';
import type { AnimeEditorScheduleBoard, AnimeEditorScheduleBoardEntry, AnimeSchedulePlacement } from '../../../../../shared/contracts/anime.types';
import { toAnimeScheduleBoardLoad, toAnimeScheduleWeekDays, toAnimeScheduleWeekView } from '../anime-schedule-card.helpers';

/**
 * Builds one board entry.
 * @param animeId The anime.
 * @param placements Its placements.
 * @returns The entry.
 */
function entry(animeId: string, placements: readonly AnimeSchedulePlacement[]): AnimeEditorScheduleBoardEntry {
  return { animeId, name: animeId, active: true, modifiedAt: 1, placements, status: 0, progress: 0, originHighlighted: false };
}

/** Lunes, Martes and Jueves weekdays plus a special queue, as the backend sends them. */
const DESTINATIONS = [
  { id: 'Lunes', label: 'Lunes', kind: 'weekday' as const },
  { id: 'Martes', label: 'Martes', kind: 'weekday' as const },
  { id: 'Sin ver', label: 'Sin ver', kind: 'special' as const },
  { id: 'Jueves', label: 'Jueves', kind: 'weekday' as const },
];

/**
 * Builds a board whose origin may differ from the selected anime, like the board an apply returns.
 * @param entries The entries.
 * @returns The board.
 */
function board(entries: readonly AnimeEditorScheduleBoardEntry[]): AnimeEditorScheduleBoard {
  return { originAnimeId: '', boardModifiedAt: 1, destinations: DESTINATIONS, entries };
}

describe('toAnimeScheduleWeekDays', () => {
  it('gives one cell per weekday, ranks the selected anime by normalized order, and counts that day', () => {
    const days = toAnimeScheduleWeekDays(board([
      entry('a', [{ day: 'Lunes', order: 10 }]),
      entry('me', [{ day: 'Lunes', order: 30 }, { day: 'Martes', order: 2 }]),
      entry('b', [{ day: 'Lunes', order: 20 }, { day: 'Sin ver', order: 1 }]),
      entry('c', [{ day: 'Martes', order: 5 }]),
    ]), 'me');

    expect(days).toEqual([
      { id: 'Lunes', label: 'Lunes', position: { order: 3, total: 3 }, ariaLabel: 'Lunes: 3 of 3' },
      { id: 'Martes', label: 'Martes', position: { order: 1, total: 2 }, ariaLabel: 'Martes: 1 of 2' },
      { id: 'Jueves', label: 'Jueves', ariaLabel: 'Jueves: not scheduled' },
    ]);
  });

  it('counts an anime placed twice on one day once, at its first place', () => {
    const days = toAnimeScheduleWeekDays(board([
      entry('me', [{ day: 'Lunes', order: 4 }, { day: 'Lunes', order: 1 }]),
      entry('a', [{ day: 'Lunes', order: 2 }]),
    ]), 'me');

    expect(days[0]).toEqual({ id: 'Lunes', label: 'Lunes', position: { order: 1, total: 2 }, ariaLabel: 'Lunes: 1 of 2' });
  });

  it('keeps board order for animes that share one order value', () => {
    const days = toAnimeScheduleWeekDays(board([
      entry('a', [{ day: 'Lunes', order: 1 }]),
      entry('me', [{ day: 'Lunes', order: 1 }]),
    ]), 'me');

    expect(days[0]?.position).toEqual({ order: 2, total: 2 });
  });
});

describe('toAnimeScheduleWeekView', () => {
  it('serves the days of a read board for the selected anime', () => {
    const view = toAnimeScheduleWeekView({ status: 'ready', board: board([entry('me', [{ day: 'Jueves', order: 1 }])]) }, 'me');

    expect(view.status).toBe('ready');
    expect(view.days.map((day) => day.ariaLabel)).toEqual(['Lunes: not scheduled', 'Martes: not scheduled', 'Jueves: 1 of 1']);
    expect(view.failureMessage).toBeUndefined();
  });

  it('serves no days while idle, loading or failed, and the failure message', () => {
    expect(toAnimeScheduleWeekView({ status: 'idle' }, 'me')).toEqual({ status: 'idle', days: [] });
    expect(toAnimeScheduleWeekView({ status: 'loading' }, 'me')).toEqual({ status: 'loading', days: [] });
    expect(toAnimeScheduleWeekView({ status: 'failed', message: 'offline', board: board([]) }, 'me')).toEqual({ status: 'failed', days: [], failureMessage: 'offline' });
  });
});

describe('toAnimeScheduleBoardLoad', () => {
  it('reads a loaded board as ready', () => {
    const loaded = board([]);
    expect(toAnimeScheduleBoardLoad({ outcome: 'applied', message: 'loaded', board: loaded })).toEqual({ status: 'ready', board: loaded });
  });

  it('reads an error outcome as failed with its message and keeps the fallback board', () => {
    const fallback = board([]);
    expect(toAnimeScheduleBoardLoad({ outcome: 'error', message: 'runtime unavailable', board: fallback })).toEqual({ status: 'failed', message: 'runtime unavailable', board: fallback });
  });

  it('reads a missing board as failed with the generic message', () => {
    expect(toAnimeScheduleBoardLoad({ outcome: 'applied', message: '' })).toEqual({ status: 'failed', message: 'The schedule board could not be loaded.' });
    expect(toAnimeScheduleBoardLoad({ outcome: 'error', message: 'offline' }).board).toBeUndefined();
  });
});
