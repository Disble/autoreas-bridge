import { useSeasonStore } from '../../../../shared/store/season-store/season-store';

/**
 * useIntakeStoreSlice reads the intake panel's Season store slice: the rows,
 * the read-only/error/busy flags, and every store action the panel drives. All
 * Wails I/O flows through these actions. Split out of `useIntakePanel` so the
 * composer carries no store selectors itself.
 * @returns The rows, flags, messages, and actions the panel reads and drives.
 */
export function useIntakeStoreSlice() {
  // 3. Context/3rd Party Hooks
  const seasonAnimes = useSeasonStore((state) => state.seasonAnimes);
  const readOnly = useSeasonStore((state) => state.readOnly);
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const busyMessage = useSeasonStore((state) => state.busyMessage);
  const matchingRun = useSeasonStore((state) => state.matchingRun);
  const refreshAnimes = useSeasonStore((state) => state.refreshAnimes);
  const reconcileIntake = useSeasonStore((state) => state.reconcileIntake);
  const runMatching = useSeasonStore((state) => state.runMatching);
  const resolveMatch = useSeasonStore((state) => state.resolveMatch);
  const discardName = useSeasonStore((state) => state.discardName);
  const setSeasonAnimeMetadata = useSeasonStore((state) => state.setSeasonAnimeMetadata);
  const createSeasonAnimes = useSeasonStore((state) => state.createSeasonAnimes);
  const recheckAvailability = useSeasonStore((state) => state.recheckAvailability);

  return {
    seasonAnimes,
    readOnly,
    errorMessage,
    busyMessage,
    matchingRun,
    refreshAnimes,
    reconcileIntake,
    runMatching,
    resolveMatch,
    discardName,
    setSeasonAnimeMetadata,
    createSeasonAnimes,
    recheckAvailability,
  };
}
