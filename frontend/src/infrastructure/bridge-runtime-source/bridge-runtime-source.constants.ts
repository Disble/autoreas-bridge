import type { contracts } from '../../../wailsjs/go/models';
import type { AnimeEditorSaveResult } from '../../shared/contracts/anime.types';
import type { BridgeRuntimeSource } from './bridge-runtime-source.types';

/** Event emitted when the active pairing token gets consumed. */
export const PAIRING_TOKEN_CONSUMED_EVENT_NAME = 'pairing.token-consumed';

/** Fail-closed result matching the generated Wails command-result contract. */
export const RUNTIME_UNAVAILABLE_COMMAND_RESULT: contracts.EpisodeCommandResult = {
  message: 'runtime unavailable',
  modifiedAt: 0,
  status: 'error',
};

/** Fail-closed result for anime editor/runtime mutations that require an explicit outcome. */
export const RUNTIME_UNAVAILABLE_EDITOR_RESULT: AnimeEditorSaveResult = {
  animeId: '',
  message: 'runtime unavailable',
  outcome: 'error',
};

/** Module-local singleton container for the shared bridge runtime source. */
export const BRIDGE_RUNTIME_SOURCE_STATE: { sharedSource: BridgeRuntimeSource | null } = {
  sharedSource: null,
};
