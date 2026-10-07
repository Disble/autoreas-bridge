import { describe, expect, it, vi } from 'vitest';

import type {
  SeasonAnimeRow,
  SeasonDailyBoardEntry,
  SeasonOrderingSnapshot,
  SeasonSource,
} from '../../../../../infrastructure/season-source/season-source.types';
import {
  groupSnapshotSections,
  listViewAnimeIds,
  readDailyBoardHistory,
  resolveDailyBoardHistory,
  selectDailyBoardView,
} from '../daily-board-history.helpers';
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

/** Builds a season port whose snapshot read is the given implementation, or absent. */
function sourceWith(read?: SeasonSource['getSeasonOrderingSnapshot']): SeasonSource {
  return { getSeasonOrderingSnapshot: read } as SeasonSource;
}

/** A stored ordering snapshot carrying the given Daily board. */
function snapshot(dailyBoard?: SeasonOrderingSnapshot['dailyBoard']): SeasonOrderingSnapshot {
  return { recorded: true, rail: [], grid: [], dailyBoard };
}

/** Ids of every row in each section. */
function sectionIds(sections: ReturnType<typeof groupSnapshotSections>) {
  return [sections.sinVer, sections.verHoy, sections.visto].map((rows) => rows.map((r) => r.id));
}

describe('readDailyBoardHistory', () => {
  const entries = [entry('a', 'Visto', 1)];

  it.each([
    { name: 'a recorded Daily board', read: snapshot({ recorded: true, entries }), want: { status: 'recorded', entries } },
    { name: 'a board recorded as absent', read: snapshot({ recorded: false, entries: [] }), want: { status: 'unrecorded' } },
    { name: 'a snapshot without a Daily board', read: snapshot(), want: { status: 'unrecorded' } },
  ])('settles $name for the season it read', async ({ read, want }) => {
    const getSeasonOrderingSnapshot = vi.fn().mockResolvedValue(read);
    await expect(readDailyBoardHistory(sourceWith(getSeasonOrderingSnapshot), 's1')).resolves.toEqual({ seasonId: 's1', history: want });
    expect(getSeasonOrderingSnapshot).toHaveBeenCalledWith('s1');
  });

  it.each([
    { name: 'a source that cannot read the snapshot', source: sourceWith(), message: DAILY_BOARD_HISTORY_LOAD_ERROR },
    { name: 'a read that throws an error', source: sourceWith(vi.fn().mockRejectedValue(new Error('boom'))), message: 'boom' },
    { name: 'a read that throws a non-error', source: sourceWith(vi.fn().mockRejectedValue('boom')), message: DAILY_BOARD_HISTORY_LOAD_ERROR },
  ])('reports $name as a failure, never as unrecorded', async ({ source, message }) => {
    await expect(readDailyBoardHistory(source, 's1')).resolves.toEqual({ seasonId: 's1', history: { status: 'failed', errorMessage: message } });
  });
});

describe('resolveDailyBoardHistory', () => {
  const recorded: DailyBoardHistory = { status: 'unrecorded' };

  it.each([
    { name: 'an open season', viewSeasonId: null, loaded: { seasonId: 's1', history: recorded }, want: { status: 'live' } },
    { name: 'a closed season before any read settled', viewSeasonId: 's1', loaded: null, want: { status: 'loading' } },
    { name: 'a closed season whose settled read is another season’s', viewSeasonId: 's2', loaded: { seasonId: 's1', history: recorded }, want: { status: 'loading' } },
    { name: 'a closed season with its own settled read', viewSeasonId: 's1', loaded: { seasonId: 's1', history: recorded }, want: recorded },
  ])('resolves $name', ({ viewSeasonId, loaded, want }) => {
    expect(resolveDailyBoardHistory(viewSeasonId, loaded)).toEqual(want);
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
    expect([view.mode, sectionIds(view.sections), view.plainRows, view.historyError]).toEqual([mode, [[], [], []], [], historyError]);
  });
});

describe('listViewAnimeIds', () => {
  it('lists the section rows then the plain rows', () => {
    const view = selectDailyBoardView([row('a', 'Visto')], { status: 'live' });
    expect(listViewAnimeIds({ ...view, plainRows: [row('p', '')] })).toEqual(['anime-a', 'anime-p']);
  });
});
