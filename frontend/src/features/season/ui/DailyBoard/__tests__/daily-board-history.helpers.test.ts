import { describe, expect, it } from 'vitest';

import type { SeasonAnimeRow, SeasonDailyBoardEntry, SeasonOrderingSnapshot } from '../../../../../shared/contracts/season.types';
import type { AsyncView } from '../../../../../shared/query/async-view/async-view.types';
import { groupSnapshotSections, listViewAnimeIds, selectDailyBoardView, toDailyBoardHistory } from '../daily-board-history.helpers';
import { DAILY_BOARD_HISTORY_LOAD_ERROR } from '../daily-board.constants';
import type { DailyBoardHistory } from '../daily-board.types';

/** Builds a season row carrying only the fields these helpers read. */
function row(id: string, section: string, availability = 'created'): SeasonAnimeRow {
  return { id, animeId: `anime-${id}`, availability, section } as SeasonAnimeRow;
}

/** Builds a stored Daily board entry for a row. */
function entry(rowId: string, section: string, order: number): SeasonDailyBoardEntry {
  return { rowId, animeId: `anime-${rowId}`, section, order };
}

/** A settled snapshot read whose stored snapshot carries the given Daily board. */
function settled(dailyBoard?: SeasonOrderingSnapshot['dailyBoard']): AsyncView<SeasonOrderingSnapshot> {
  return { kind: 'ready', data: { recorded: true, rail: [], grid: [], dailyBoard }, isRefreshing: false };
}

/** Ids of every row in each section. */
function sectionIds(sections: ReturnType<typeof groupSnapshotSections>) {
  return [sections.sinVer, sections.verHoy, sections.visto].map((rows) => rows.map((r) => r.id));
}

describe('toDailyBoardHistory', () => {
  const entries = [entry('a', 'Visto', 1)];

  it.each<{ name: string; viewSeasonId: string | null; canRead: boolean; snapshot: AsyncView<SeasonOrderingSnapshot>; want: DailyBoardHistory }>([
    { name: 'an open season', viewSeasonId: null, canRead: true, snapshot: settled(), want: { status: 'live' } },
    { name: 'a closed season whose read is in flight', viewSeasonId: 's1', canRead: true, snapshot: { kind: 'loading' }, want: { status: 'loading' } },
    { name: 'a recorded Daily board', viewSeasonId: 's1', canRead: true, snapshot: settled({ recorded: true, entries }), want: { status: 'recorded', entries } },
    { name: 'a board recorded as absent', viewSeasonId: 's1', canRead: true, snapshot: settled({ recorded: false, entries: [] }), want: { status: 'unrecorded' } },
    { name: 'a snapshot without a Daily board', viewSeasonId: 's1', canRead: true, snapshot: settled(), want: { status: 'unrecorded' } },
    {
      name: 'a source that cannot read the snapshot as a failure',
      viewSeasonId: 's1',
      canRead: false,
      snapshot: { kind: 'loading' },
      want: { status: 'failed', errorMessage: DAILY_BOARD_HISTORY_LOAD_ERROR },
    },
    {
      name: 'a failed read as a failure carrying its message',
      viewSeasonId: 's1',
      canRead: true,
      snapshot: { kind: 'failure', code: 'internal', message: 'boom' },
      want: { status: 'failed', errorMessage: 'boom' },
    },
  ])('resolves $name', ({ viewSeasonId, canRead, snapshot, want }) => {
    expect(toDailyBoardHistory(viewSeasonId, canRead, snapshot)).toEqual(want);
  });
});

describe('groupSnapshotSections', () => {
  it('rebuilds each section from the stored entries in stored order, whatever the live section says', () => {
    const rows = [row('a', 'Lunes'), row('b', 'Visto'), row('c', 'Ver hoy'), row('d', '')];
    const entries = [entry('c', 'Sin ver', 2), entry('a', 'Sin ver', 1), entry('d', 'Ver hoy', 1), entry('b', 'Visto', 1)];

    expect(sectionIds(groupSnapshotSections(rows, entries))).toEqual([['a', 'c'], ['d'], ['b']]);
  });

  it('skips an entry whose row is not in the season rows, and one in an unknown section', () => {
    const entries = [entry('gone', 'Visto', 1), entry('a', 'Visto', 2), entry('a', 'Estrenos', 1)];

    expect(sectionIds(groupSnapshotSections([row('a', 'Visto')], entries))).toEqual([[], [], ['a']]);
  });
});

describe('selectDailyBoardView', () => {
  const rows = [row('a', 'Ver hoy'), row('p', 'Ver hoy', 'available'), row('b', 'Visto')];

  it('groups an open season by live sections', () => {
    const view = selectDailyBoardView(rows, { status: 'live' });
    expect([view.mode, sectionIds(view.sections), view.plainRows]).toEqual(['sections', [[], ['a'], ['b']], []]);
  });

  it('groups a recorded closed season by its stored board', () => {
    const view = selectDailyBoardView(rows, { status: 'recorded', entries: [entry('a', 'Visto', 1)] });
    expect([view.mode, sectionIds(view.sections), view.plainRows]).toEqual(['sections', [[], [], ['a']], []]);
  });

  it('lists only the created animes, in row order and in no section, for an unrecorded closed season', () => {
    const view = selectDailyBoardView(rows, { status: 'unrecorded' });
    expect([view.mode, sectionIds(view.sections), view.plainRows.map((r) => r.id)]).toEqual(['plain', [[], [], []], ['a', 'b']]);
  });

  it.each([
    { history: { status: 'loading' } as const, mode: 'loading', historyError: undefined },
    { history: { status: 'failed', errorMessage: 'boom' } as const, mode: 'failed', historyError: 'boom' },
  ])('renders no row while the closed season is $mode', ({ history, mode, historyError }) => {
    const view = selectDailyBoardView(rows, history);
    expect([view.mode, sectionIds(view.sections), view.plainRows, view.boardError]).toEqual([mode, [[], [], []], [], historyError]);
  });
});

describe('listViewAnimeIds', () => {
  it('lists the section rows then the plain rows', () => {
    const view = selectDailyBoardView([row('a', 'Visto')], { status: 'live' });
    expect(listViewAnimeIds({ ...view, plainRows: [row('p', '')] })).toEqual(['anime-a', 'anime-p']);
  });
});
