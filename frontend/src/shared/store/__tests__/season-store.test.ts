import { beforeEach, describe, expect, it } from 'vitest';

import type { SeasonSnapshot } from '../../contracts/season.types';
import type { SeasonDiscardNotice } from '../season-store/season-store.types';
import { getSeasonStoreState, isSeasonOpen, resetSeasonStore, setSeasonStoreState } from '../season-store/season-store.helpers';

/**
 * Guards the store module boundary: the hook module composes the store through
 * `useSeasonStore` and declares no command plumbing of its own, so the store
 * value stays in the store module it belongs to.
 */
it('keeps the command helper out of the hook module', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const hookModulePath = join(process.cwd(), 'src/shared/store/season-store/season-store.ts');
  const sourceText = readFileSync(hookModulePath, 'utf8');

  expect(sourceText).not.toMatch(/async function\s+runIntakeCommand\b/);
});

/**
 * Guards the single-instance contract after the store value moved into
 * `season-store.store.ts`: the helpers accessors must read and write exactly the
 * instance the store module declares, or subscribers and tests would drift onto
 * two stores.
 */
it('shares one store instance between the store module and the helpers accessors', async () => {
  const { seasonStore } = await import('../season-store/season-store.store');

  setSeasonStoreState({ readOnly: true });

  expect(seasonStore.getState().readOnly).toBe(true);
  expect(getSeasonStoreState()).toBe(seasonStore.getState());

  resetSeasonStore();
});

/** Builds a season snapshot with the fields under test, open unless overridden. */
function makeSeason(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status: 'open',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

/** One row of the shared open-season predicate table: snapshot in, answer out. */
type SeasonOpenCase = {
  /** Name of the snapshot case the row feeds the predicate. */
  readonly name: string;
  /** The snapshot the query would answer for that case. */
  readonly season: SeasonSnapshot | null;
  /** Answer the shared predicate must give. */
  readonly expected: boolean;
};

/** Truth table of the shared open-season predicate, one row per loadable state. */
const SEASON_OPEN_CASES: readonly SeasonOpenCase[] = [
  { name: 'the live open season', season: makeSeason(), expected: true },
  { name: 'a closed historical season', season: makeSeason({ status: 'closed' }), expected: false },
  { name: 'no loaded snapshot at all', season: null, expected: false },
];

describe('isSeasonOpen', () => {
  it.each(SEASON_OPEN_CASES)('reports $name as $expected', ({ season, expected }) => {
    expect(isSeasonOpen(season)).toBe(expected);
  });
});

describe('season store surface', () => {
  beforeEach(() => {
    resetSeasonStore();
  });

  /**
   * Pins the store to UI state: the season, its rows, the past-seasons list and
   * every command that fetched or refreshed them belong to `shared/query`. A
   * field or action reappearing here would be a second source of truth for
   * server data, so the whole key set is asserted, not a sample of it.
   */
  it('holds UI state only, starts live and writable, sequences discards, and resets back to live', () => {
    const keys = Object.keys(getSeasonStoreState()).sort();

    expect(keys).toEqual([
      'applyMatchingProgress',
      'beginMatchingRun',
      'busyMessage',
      'errorMessage',
      'finishMatchingRun',
      'lastDiscard',
      'matchingProgress',
      'matchingRun',
      'readOnly',
      'viewSeasonId',
    ]);
    expect(getSeasonStoreState()).toMatchObject({ viewSeasonId: null, readOnly: false, lastDiscard: null });

    const first: SeasonDiscardNotice = { rowId: 'sa-1', rawName: 'Dr. Stone', sequence: 1 };
    const second: SeasonDiscardNotice = { rowId: 'sa-1', rawName: 'Dr. Stone', sequence: 2 };

    setSeasonStoreState({ viewSeasonId: 'past', readOnly: true, lastDiscard: first });
    expect(getSeasonStoreState().lastDiscard).toEqual(first);

    setSeasonStoreState({ lastDiscard: second });
    // Same row, same name, new sequence: the notification pipeline must still
    // read it as a new notice and push a second Undo toast.
    expect(getSeasonStoreState().lastDiscard).toEqual(second);

    resetSeasonStore();

    expect(getSeasonStoreState()).toMatchObject({ viewSeasonId: null, readOnly: false, lastDiscard: null });
  });
});
