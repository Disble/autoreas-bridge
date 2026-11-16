import { useSeasonStore } from '../../../../shared/store/season-store/season-store';
import type { SeasonWorkspaceStoreBindings } from './season-workspace.types';

/**
 * Subscribes to the Season store UI state used by the Season Workspace.
 * @returns The shared banner text and the read-only view flag.
 */
export function useSeasonWorkspaceStoreBindings(): SeasonWorkspaceStoreBindings {
  const errorMessage = useSeasonStore((state) => state.errorMessage);
  const readOnly = useSeasonStore((state) => state.readOnly);

  return { errorMessage, readOnly };
}
