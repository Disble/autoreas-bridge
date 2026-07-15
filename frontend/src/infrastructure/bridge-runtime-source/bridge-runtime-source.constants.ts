import type { contracts } from '../../../wailsjs/go/models';
import type { AnimeLegacyPullResult } from '../../shared/contracts/anime.types';
import type { BridgeRuntimeSource } from './bridge-runtime-source.types';

/** Event emitted when the active pairing token gets consumed. */
export const PAIRING_TOKEN_CONSUMED_EVENT_NAME = 'pairing.token-consumed';

/** Safe degraded result returned when pull-from-legacy cannot reach Wails. */
export const RUNTIME_UNAVAILABLE_PULL_RESULT: AnimeLegacyPullResult = {
  message: 'runtime unavailable',
  prunedCount: 0,
  status: 'error',
  updatedCount: 0,
  warningCount: 0,
};

/** Fail-closed result matching the generated Wails command-result contract. */
export const RUNTIME_UNAVAILABLE_COMMAND_RESULT: contracts.ChapterCommandResult = {
  message: 'runtime unavailable',
  modifiedAt: 0,
  status: 'error',
};

/** Module-local singleton container for the shared bridge runtime source. */
export const BRIDGE_RUNTIME_SOURCE_STATE: { sharedSource: BridgeRuntimeSource | null } = {
  sharedSource: null,
};
