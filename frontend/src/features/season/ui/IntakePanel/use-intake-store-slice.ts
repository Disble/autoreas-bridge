import type { SeasonQuerySource } from '../../../../shared/contracts/season.types';
import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import { useIntakeCommands } from './use-intake-commands';
import { useIntakeQuery } from './use-intake-query';

/** Composes intake query data, command mutations, and the season UI state. */
export function useIntakeStoreSlice(source: SeasonQuerySource) {
  // 3. Context/third-party hooks
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const busyMessage = useSeasonStore((state) => state.busyMessage);
  const matchingRun = useSeasonStore((state) => state.matchingRun);
  // 4. Queries/Mutations
  const query = useIntakeQuery(source);
  const commands = useIntakeCommands(query.refetch, query.rows);
  return { seasonAnimes: query.rows, asyncView: query.view, readOnly, errorMessage, busyMessage, matchingRun, ...commands };
}
