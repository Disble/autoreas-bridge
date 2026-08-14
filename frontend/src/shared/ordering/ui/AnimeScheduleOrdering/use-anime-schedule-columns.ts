import { useMemo } from 'react';
import { getInstancesIn } from '../../ordering.helpers';
import { ANIME_SCHEDULE_STAGING_CONTAINER_ID } from './anime-schedule-ordering.constants';
import { getStagedAnimeIds } from './anime-schedule-ordering.helpers';
import type { AnimeEditorScheduleBoard } from '../../../contracts/anime.types';
import type { AnimeScheduleColumnsViewModel, AnimeScheduleOrderingState } from './anime-schedule-ordering.types';

/**
 * Projects the draft state into the board's columns and staging summary. Split
 * out of `useAnimeScheduleOrdering` so neither function carries the whole
 * hook budget: this half is pure projection and holds no callbacks or effects.
 * @param board The authoritative schedule board.
 * @param state The current draft.
 * @returns The column and staging half of the ordering view model.
 */
export function useAnimeScheduleColumns(
  board: AnimeEditorScheduleBoard,
  state: AnimeScheduleOrderingState,
): AnimeScheduleColumnsViewModel {
  const columns = useMemo(() => board.destinations.map((destination) => ({
    ...destination,
    cards: getInstancesIn(state, destination.id),
  })), [board.destinations, state]);
  const weekdayColumns = useMemo(() => columns.filter((column) => column.kind === 'weekday'), [columns]);
  const specialColumns = useMemo(() => columns.filter((column) => column.kind === 'special'), [columns]);
  const stagingCards = useMemo(() => getInstancesIn(state, ANIME_SCHEDULE_STAGING_CONTAINER_ID), [state]);
  const stagedAnimeCount = useMemo(() => getStagedAnimeIds(state).size, [state]);

  return { columns, weekdayColumns, specialColumns, stagingCards, stagedAnimeCount };
}
