import { useCallback, useMemo } from 'react';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { runSeasonCommand, toSeasonBannerMessage } from '../../../../shared/season/season.helpers';
import { getSeasonStoreState, setSeasonStoreState } from '../../../../shared/store/season-store/season-store.helpers';
import type { IntakeCommand, IntakeCommandRows, IntakeCommands } from './intake-commands.types';

/** Runs intake commands and awaits the authoritative row refresh after success. */
export function useIntakeCommands(refetch: () => Promise<unknown>, rows: IntakeCommandRows): IntakeCommands {
  // 4. Queries/Mutations
  const { mutateAsync } = useBridgeMutation({
    mutationFn: (command: IntakeCommand) => runSeasonCommand(command.execute, command.fallback),
    onSuccess: async (_result, command) => {
      setSeasonStoreState({ errorMessage: undefined });
      const state = getSeasonStoreState();
      if (state.viewSeasonId === null && (!command.matching || state.matchingRun === null)) await refetch();
    },
    onError: (error, command) => {
      setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, { fallback: command.fallback, fixedMessage: false }) });
      if (command.matching) getSeasonStoreState().finishMatchingRun();
    },
  });
  // 6. Callbacks
  const run = useCallback(async (command: IntakeCommand): Promise<boolean> => {
    if (getSeasonStoreState().readOnly) return false;
    if (command.busy !== undefined) setSeasonStoreState({ busyMessage: command.busy });
    try {
      await mutateAsync(command);
      return true;
    } catch {
      return false;
    } finally {
      if (command.busy !== undefined) setSeasonStoreState({ busyMessage: undefined });
    }
  }, [mutateAsync]);
  return useMemo(() => ({
    reconcileIntake: async (source, raw) => { await run({ execute: () => source.reconcileIntake(raw), fallback: 'Failed to update intake' }); },
    runMatching: async (source) => { await run({ execute: () => source.runMatching(), fallback: 'Failed to run matching', busy: 'Matching names against jkanime…', matching: true }); },
    resolveMatch: async (source, id, url) => { await run({ execute: () => source.resolveMatch(id, url), fallback: 'Failed to resolve match' }); },
    discardName: async (source, id) => {
      const rawName = rows.find((row) => row.id === id)?.rawName ?? '';
      const succeeded = await run({ execute: () => source.discardName(id), fallback: 'Failed to discard name' });
      if (succeeded) setSeasonStoreState({ lastDiscard: { rowId: id, rawName, sequence: (getSeasonStoreState().lastDiscard?.sequence ?? 0) + 1 } });
      return succeeded;
    },
    restoreName: (source, id) => run({ execute: () => source.restoreName(id), fallback: 'Failed to restore name' }),
    setSeasonAnimeMetadata: async (source, id, json) => { await run({ execute: () => source.setSeasonAnimeMetadata(id, json), fallback: 'Failed to save metadata' }); },
    createSeasonAnimes: async (source, ids, folders, metadata) => { await run({ execute: () => source.createSeasonAnimes(ids, folders, metadata), fallback: 'Failed to create animes', busy: 'Creating animes…' }); },
    recheckAvailability: async (source) => { await run({ execute: () => source.recheckAvailability(), fallback: 'Failed to recheck availability', busy: 'Checking episode availability…' }); },
  }), [rows, run]);
}
