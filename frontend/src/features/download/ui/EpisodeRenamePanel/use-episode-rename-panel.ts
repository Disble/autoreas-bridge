import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import type { EpisodeRenamePanelState, EpisodeRenamePanelStatus } from './episode-rename-panel.types';

/**
 * useEpisodeRenamePanel loads the persisted episode auto-rename opt-in and
 * exposes a `setEnabled` mutation that persists it.
 *
 * The toggle flips optimistically so it never feels laggy, and every failure
 * path — a refusal string from the binding or a thrown error — rolls it back.
 * A toggle that claims a setting the backend never stored is worse than a slow
 * one, because the next download quietly disagrees with the UI.
 */
export function useEpisodeRenamePanel(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<EpisodeRenamePanelState>({
    enabled: false,
    hasLoaded: false,
    isSaving: false,
    errorMessage: undefined,
  });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const setEnabled = useCallback(
    async (next: boolean) => {
      const previous = state.enabled;
      setState((prev) => ({ ...prev, enabled: next, isSaving: true, errorMessage: undefined }));

      try {
        const result = await source.setEpisodeRenameEnabled(next);
        if (result !== 'ok') {
          setState((prev) => ({ ...prev, enabled: previous, isSaving: false, errorMessage: result }));
          return;
        }
        setState((prev) => ({ ...prev, isSaving: false }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          enabled: previous,
          isSaving: false,
          errorMessage: toErrorMessage(error, 'Failed to save the episode rename setting'),
        }));
      }
    },
    [state.enabled, source],
  );

  // 7. Effects
  useEffect(() => {
    let active = true;

    source
      .getDownloadConfig()
      .then((config) => ({ enabled: config.renameEpisodes, errorMessage: undefined as string | undefined }))
      .catch((error: unknown) => ({
        enabled: false,
        errorMessage: toErrorMessage(error, 'Failed to load the episode rename setting'),
      }))
      .then((outcome) => {
        if (!active) {
          return;
        }
        setState((prev) => ({ ...prev, enabled: outcome.enabled, hasLoaded: true, errorMessage: outcome.errorMessage }));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [source]);

  let status: EpisodeRenamePanelStatus = 'ready';
  if (!state.hasLoaded) {
    status = 'loading';
  } else if (state.errorMessage !== undefined && !state.isSaving) {
    status = 'error';
  }

  return {
    status,
    enabled: state.enabled,
    isSaving: state.isSaving,
    errorMessage: state.errorMessage,
    setEnabled,
  };
}
