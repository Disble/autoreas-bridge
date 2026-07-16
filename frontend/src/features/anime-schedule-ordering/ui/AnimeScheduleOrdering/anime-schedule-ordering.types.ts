import type { DragOverEvent } from '@dnd-kit/react';
import type { ReactNode } from 'react';
import type { ApplyAnimeScheduleDraftEntry, AnimeEditorScheduleBoard, AnimeSchedulePlacement } from '../../../../shared/contracts/anime.types';

/** Component contract for the shared anime schedule ordering board. */
export interface AnimeScheduleOrderingProps {
  readonly board: AnimeEditorScheduleBoard;
  readonly feedback?: string;
  readonly isApplying?: boolean;
  readonly onApply: (entries: readonly ApplyAnimeScheduleDraftEntry[]) => Promise<void>;
  readonly onClose?: () => void;
}

/** One draggable card instance inside the shared schedule draft. */
export interface AnimeScheduleOrderingInstance {
  readonly key: string;
  readonly animeId: string;
  readonly name: string;
  readonly baseModifiedAt: number;
  readonly originHighlighted: boolean;
  readonly initialOrder?: number;
}

/** Internal dnd-kit working state for the schedule draft. */
export interface AnimeScheduleOrderingState {
  readonly order: Record<string, readonly string[]>;
  readonly instances: Record<string, AnimeScheduleOrderingInstance>;
  readonly duplicateAllowedDestinations?: readonly string[];
}

/** One normalized placement inside a changed-record schedule payload. */
export type AnimeScheduleDraftPlacement = AnimeSchedulePlacement;

/** Props for one droppable destination container. */
export interface AnimeScheduleOrderingColumnProps {
  readonly containerId: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Props for one draggable anime card in the schedule board. */
export interface AnimeScheduleOrderingCardProps {
  readonly instance: AnimeScheduleOrderingInstance;
  readonly containerId: string;
  readonly index: number;
  readonly canRemove: boolean;
  readonly onDuplicate: () => void;
  readonly onRemove: () => void;
}

/** View model returned by the colocated schedule-ordering hook. */
export interface AnimeScheduleOrderingColumnViewModel {
  readonly id: string;
  readonly label: string;
  readonly kind: 'weekday' | 'special';
  readonly cards: readonly AnimeScheduleOrderingInstance[];
}

/** View model returned by the colocated schedule-ordering hook. */
export interface AnimeScheduleOrderingViewModel {
  readonly columns: readonly AnimeScheduleOrderingColumnViewModel[];
  readonly weekdayColumns: readonly AnimeScheduleOrderingColumnViewModel[];
  readonly specialColumns: readonly AnimeScheduleOrderingColumnViewModel[];
  readonly changeCount: number;
  readonly validationMessage?: string;
  readonly onDragOver: (event: DragOverEvent) => void;
  readonly onDuplicate: (animeId: string) => void;
  readonly onRemove: (key: string) => void;
  readonly onReset: () => void;
  readonly onApply: () => Promise<void>;
  readonly canRemove: (animeId: string) => boolean;
  readonly getOverlayName: (id: string | number) => string;
}
