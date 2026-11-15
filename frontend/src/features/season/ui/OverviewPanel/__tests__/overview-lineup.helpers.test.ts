import { describe, expect, it } from 'vitest';

import type { OrderingCard, SeasonAnimeRow, SeasonOrderingSnapshot } from '../../../../../shared/contracts/season.types';
import type { AsyncView } from '../../../../../shared/query/async-view/async-view.types';
import { OVERVIEW_LINEUP_LOAD_ERROR } from '../overview-panel.constants';
import { buildOverviewLineupView, listLineupAnimeIds, toOverviewLineupState } from '../overview-lineup.helpers';
import type { OverviewLineupState } from '../overview-panel.types';

/** Builds a stored ordering card on a weekday (or the rail) at a position. */
function card(animeId: string, dia: string, orden: number): OrderingCard {
  return { animeId, name: `Name ${animeId}`, dia, orden, section: 'Visto', isNewcomer: false };
}

/** Builds a season row carrying only the fields the lineup reads. */
function row(animeId: string, grade: number): SeasonAnimeRow {
  return { animeId, grade } as SeasonAnimeRow;
}

/** A recorded lineup state holding the given grid and rail. */
function recorded(grid: readonly OrderingCard[], rail: readonly OrderingCard[] = []): OverviewLineupState {
  return { status: 'recorded', grid, rail };
}

/** A settled snapshot read answering the given snapshot. */
function settled(data: SeasonOrderingSnapshot): AsyncView<SeasonOrderingSnapshot> {
  return { kind: 'ready', data, isRefreshing: false };
}

describe('toOverviewLineupState', () => {
  /** The stored weekday cards a recorded read returns. */
  const grid = [card('a', 'Lunes', 1)];
  /** The stored rail cards a recorded read returns. */
  const rail = [card('b', '', 0)];

  it.each<{ name: string; viewSeasonId: string | null; canRead: boolean; snapshot: AsyncView<SeasonOrderingSnapshot>; want: OverviewLineupState }>([
    { name: 'no closed season viewed', viewSeasonId: null, canRead: false, snapshot: { kind: 'loading' }, want: { status: 'loading' } },
    { name: 'a read in flight', viewSeasonId: 's1', canRead: true, snapshot: { kind: 'loading' }, want: { status: 'loading' } },
    { name: 'a recorded board', viewSeasonId: 's1', canRead: true, snapshot: settled({ recorded: true, rail, grid }), want: { status: 'recorded', grid, rail } },
    { name: 'a board recorded as absent', viewSeasonId: 's1', canRead: true, snapshot: settled({ recorded: false, rail, grid }), want: { status: 'unrecorded' } },
    {
      name: 'a source that cannot read the snapshot as a failure',
      viewSeasonId: 's1',
      canRead: false,
      snapshot: { kind: 'loading' },
      want: { status: 'failed', errorMessage: OVERVIEW_LINEUP_LOAD_ERROR },
    },
    {
      name: 'a failed read as a failure carrying its message',
      viewSeasonId: 's1',
      canRead: true,
      snapshot: { kind: 'failure', code: 'internal', message: 'boom' },
      want: { status: 'failed', errorMessage: 'boom' },
    },
  ])('resolves $name', ({ viewSeasonId, canRead, snapshot, want }) => {
    expect(toOverviewLineupState(viewSeasonId, canRead, snapshot)).toEqual(want);
  });
});

describe('buildOverviewLineupView', () => {
  it.each([
    { name: 'loading', state: { status: 'loading' } as const, display: 'loading', errorMessage: undefined },
    { name: 'failed', state: { status: 'failed', errorMessage: 'boom' } as const, display: 'failed', errorMessage: 'boom' },
    { name: 'unrecorded', state: { status: 'unrecorded' } as const, display: 'unrecorded', errorMessage: undefined },
    { name: 'recorded with no weekday card', state: recorded([], [card('a', '', 0)]), display: 'empty', errorMessage: undefined },
  ])('shows no lineup while $name', ({ state, display, errorMessage }) => {
    expect(buildOverviewLineupView(state, [])).toEqual({ display, errorMessage, days: [], summary: '' });
  });

  it('groups the stored weekday cards Lunes to Domingo in stored order, skipping empty days and non-weekday cards', () => {
    const grid = [card('c', 'Domingo', 1), card('b', 'Lunes', 2), card('a', 'Lunes', 1), card('x', 'Rail', 1), card('d', 'Miércoles', 1)];

    const view = buildOverviewLineupView(recorded(grid), []);

    expect(view.display).toBe('lineup');
    expect(view.days.map((day) => [day.day, day.items.map((item) => item.animeId)])).toEqual([
      ['Lunes', ['a', 'b']],
      ['Miércoles', ['d']],
      ['Domingo', ['c']],
    ]);
    expect(view.days[0].items[0]).toEqual({ key: 'Lunes-a', animeId: 'a', name: 'Name a', grade: null });
  });

  it.each([
    { name: 'a grade of 1', rows: [row('a', 1)], grade: 1 },
    { name: 'a grade of 0', rows: [row('a', 0)], grade: null },
    { name: 'no season row', rows: [row('z', 6)], grade: null },
  ])('shows the season-owned grade only for $name', ({ rows, grade }) => {
    expect(buildOverviewLineupView(recorded([card('a', 'Lunes', 1)]), rows).days[0].items[0].grade).toBe(grade);
  });

  it.each([
    { name: 'one anime', grid: [card('a', 'Lunes', 1)], rail: [], summary: '1 anime, as scheduled when the season closed' },
    {
      name: 'an anime placed on two days',
      grid: [card('a', 'Lunes', 1), card('a', 'Martes', 1), card('b', 'Martes', 2)],
      rail: [],
      summary: '2 animes, as scheduled when the season closed',
    },
    {
      name: 'one unplaced anime',
      grid: [card('a', 'Lunes', 1)],
      rail: [card('r', '', 0)],
      summary: '1 anime, as scheduled when the season closed · 1 left unplaced',
    },
  ])('summarizes $name', ({ grid, rail, summary }) => {
    expect(buildOverviewLineupView(recorded(grid, rail), []).summary).toBe(summary);
  });
});

describe('listLineupAnimeIds', () => {
  it('lists every rendered anime id in render order', () => {
    const view = buildOverviewLineupView(recorded([card('b', 'Martes', 1), card('a', 'Lunes', 1)]), []);

    expect(listLineupAnimeIds(view)).toEqual(['a', 'b']);
  });
});
