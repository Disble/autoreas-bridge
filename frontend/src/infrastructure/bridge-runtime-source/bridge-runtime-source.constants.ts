import type { contracts } from '../../../wailsjs/go/models';
import type { BridgeRuntimeSource } from './bridge-runtime-source.types';

/** Event emitted when the active pairing token gets consumed. */
export const PAIRING_TOKEN_CONSUMED_EVENT_NAME = 'pairing.token-consumed';

/** Event emitted when a device's changelog acknowledgment advances `last_seen_at_ms`. */
export const DEVICE_ACKNOWLEDGED_EVENT_NAME = 'sync.device_acknowledged';

/** Fail-closed result matching the generated Wails command-result contract. */
export const RUNTIME_UNAVAILABLE_COMMAND_RESULT: contracts.EpisodeCommandResult = {
  message: 'runtime unavailable',
  modifiedAt: 0,
  status: 'error',
};

/** Module-local singleton container for the shared bridge runtime source. */
export const BRIDGE_RUNTIME_SOURCE_STATE: { sharedSource: BridgeRuntimeSource | null } = {
  sharedSource: null,
};
