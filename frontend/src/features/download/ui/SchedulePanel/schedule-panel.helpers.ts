import type { ScheduleConfig } from '../../../../shared/contracts/download.types';
import type { SchedulePanelViewModel, ScheduleSaveEdits } from './schedule-panel.types';

/**
 * Maps the live `ScheduleConfig` read-model into the panel's view model:
 * pass-through booleans/strings plus human-readable last/next-run labels
 * ("Never" / "Not scheduled" for the zero-timestamp edge cases).
 */
export function toSchedulePanelViewModel(config: ScheduleConfig): SchedulePanelViewModel {
  return {
    enabled: config.enabled,
    dailyTimeHHMM: config.dailyTimeHHMM,
    running: config.running,
    lastRunLabel: config.lastRunAtMs === 0 ? 'Never' : new Date(config.lastRunAtMs).toLocaleString(),
    lastRunStatus: config.lastRunStatus,
    nextRunLabel: config.enabled && config.nextRunAtMs > 0 ? new Date(config.nextRunAtMs).toLocaleString() : 'Not scheduled',
  };
}

/**
 * Builds the full `SetScheduleConfig` write request: starts from the
 * current config (preserving server-owned run/status fields the form never
 * edits) and overlays the user's edits (`enabled`, `dailyTimeHHMM`).
 */
export function toScheduleSaveRequest(current: ScheduleConfig, edits: ScheduleSaveEdits): ScheduleConfig {
  return {
    ...current,
    ...edits,
  };
}
