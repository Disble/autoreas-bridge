import type { HosterPriorityItem } from '../../../../shared/contracts/download.types';

/** Props for the `HosterPriorityEditor` dumb-UI component. */
export interface HosterPriorityEditorProps {
  readonly className?: string;
}

/** Loading/empty/error/ready states for the hoster priority list (2026 quality bar). */
export type HosterPriorityEditorStatus = 'loading' | 'empty' | 'error' | 'ready';

/** View model for a single reorderable hoster row. */
export interface HosterPriorityRowViewModel {
  readonly id: string;
  readonly hoster: string;
  readonly priority: number;
  readonly enabled: boolean;
}

/** Aggregate view model returned by `useHosterPriorityEditor`. */
export interface HosterPriorityEditorViewModel {
  readonly status: HosterPriorityEditorStatus;
  readonly items: readonly HosterPriorityRowViewModel[];
  readonly isSaving: boolean;
  readonly errorMessage?: string;
}

/** Options accepted by `toHosterPriorityEditorViewModel` to fold in mutation/error state. */
export interface HosterPriorityEditorViewModelOptions {
  readonly isSaving: boolean;
  readonly errorMessage?: string;
}

/** Where the dragged item lands relative to the drop target, mirroring react-aria's `ItemDropTarget.dropPosition`. */
export type HosterPriorityDropPosition = 'before' | 'after';

/** Re-export for callers building reorder requests against the Wails binding shape. */
export type { HosterPriorityItem };
