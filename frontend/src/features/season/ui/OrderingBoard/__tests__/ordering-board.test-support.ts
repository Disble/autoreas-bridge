import type { DragOverEvent } from '@dnd-kit/react';
import { act } from '@testing-library/react';
import { vi } from 'vitest';

import { ORDERING_AUTOSAVE_DEBOUNCE_MS } from '../ordering-board.constants';
import type { OrderingBoard, OrderingCard, SeasonAnimeRow, SeasonOrderingSnapshot, SeasonSource } from '../../../../../shared/contracts/season.types';
import { SEASON_ANIMES_KEY } from '../../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';

/**
 * Fixtures shared by the ordering board hook suite, so its cases state only the
 * fields they care about.
 */
/** Builds one ordering card with the fields this suite cares about. */
export function card(overrides: Partial<OrderingCard> = {}): OrderingCard {
  return { animeId: 'a', name: 'A', dia: '', orden: 0, section: 'Visto', isNewcomer: false, ...overrides };
}

/** Builds a season source whose only board is the given live board, plus any case overrides. */
export function createSource(board: OrderingBoard, overrides: Partial<SeasonSource> = {}): SeasonSource {
  return {
    getSeason: vi.fn().mockResolvedValue(null),
    createSeason: vi.fn().mockResolvedValue('ok'),
    setMinApprovalGrade: vi.fn().mockResolvedValue('ok'),
    setSlots: vi.fn().mockResolvedValue('ok'),
    closeSeason: vi.fn().mockResolvedValue('ok'),
    getSeasonAnimes: vi.fn().mockResolvedValue([]),
    reconcileIntake: vi.fn().mockResolvedValue('ok'),
    sendToVerHoy: vi.fn().mockResolvedValue({ status: 'ok', pastDownloadTime: false, downloadTime: '' }),
    triggerSeasonDownloads: vi.fn().mockResolvedValue('ok'),
    downloadSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    runMatching: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue('ok'),
    restoreName: vi.fn().mockResolvedValue('ok'),
    setAnimeDays: vi.fn().mockResolvedValue('ok'),
    setGrade: vi.fn().mockResolvedValue('ok'),
    skipGrading: vi.fn().mockResolvedValue('ok'),
    setConsideration: vi.fn().mockResolvedValue('ok'),
    confirmSelection: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    setSeasonAnimeMetadata: vi.fn().mockResolvedValue('ok'),
    createSeasonAnimes: vi.fn().mockResolvedValue('ok'),
    pickFolder: vi.fn().mockResolvedValue(''),
    listSeasons: vi.fn().mockResolvedValue([]),
    getPastSeason: vi.fn().mockResolvedValue(null),
    getPastSeasonAnimes: vi.fn().mockResolvedValue([]),
    getOrderingBoard: vi.fn().mockResolvedValue(board),
    saveOrderingDraft: vi.fn().mockResolvedValue('ok'),
    applySchedule: vi.fn().mockResolvedValue({ status: 'ok', applied: 1, failed: [] }),
    reopenOrdering: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    getCheckTime: vi.fn().mockResolvedValue('21:00'),
    setCheckTime: vi.fn().mockResolvedValue('ok'),
    searchProviders: vi.fn().mockResolvedValue({ status: 'ok', pages: [] }),
    openPage: vi.fn(),
    ...overrides,
  };
}

/** Builds the drag-over event the hook's reshuffle callback receives. */
export function dragOverEvent(sourceId: string, targetId: string): DragOverEvent {
  return {
    preventDefault: vi.fn(),
    operation: {
      canceled: false,
      source: {
        id: sourceId,
        manager: {
          dragOperation: {
            shape: null,
            position: { current: { y: 0 } },
          },
        },
      },
      target: { id: targetId },
    },
  } as unknown as DragOverEvent;
}

/** Waits on real timers past the autosave debounce, so a stray autosave would have fired. */
export async function waitPastAutosave(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, ORDERING_AUTOSAVE_DEBOUNCE_MS + 50); });
  });
}

/** Builds a stored closure snapshot, recorded by default. */
export function snapshot(overrides: Partial<SeasonOrderingSnapshot> = {}): SeasonOrderingSnapshot {
  return { recorded: true, rail: [], grid: [], ...overrides };
}

/**
 * A query wrapper with the season module ready and the open season's rows
 * already read, so the board's season bindings show `rows` without a fetch.
 * @param rows The open season's rows; null leaves them unread, so the bindings fetch them.
 * @returns The client (to change the rows while mounted) and the wrapper.
 */
export function orderingQueryWrapper(rows: readonly SeasonAnimeRow[] | null = []) {
  const { client, wrapper } = createModulesTestWrapper(status('season', 'ready'));
  if (rows !== null) {
    client.setQueryData(SEASON_ANIMES_KEY, rows);
  }
  return { client, wrapper };
}
