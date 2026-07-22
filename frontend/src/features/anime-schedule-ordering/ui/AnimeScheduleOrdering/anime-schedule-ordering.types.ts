import type { DragOverEvent } from '@dnd-kit/react';
import type { ReactNode } from 'react';
import type { ApplyAnimeScheduleDraftEntry, AnimeEditorScheduleBoard, AnimeSchedulePlacement } from '../../../../shared/contracts/anime.types';

/** Test-only move command for driving the real draft reducer under jsdom. */
export interface AnimeScheduleOrderingTestMoveCommand {
  readonly animeId: string;
  readonly destinationId: string;
  readonly order: number;
}

/** Test-only driver for exercising the real ordering state without pointer drag. */
export interface AnimeScheduleOrderingTestDriver {
  readonly moveAnime: (command: AnimeScheduleOrderingTestMoveCommand) => void;
}

/** Mutable holder used by integration tests to access the schedule test driver. */
export interface AnimeScheduleOrderingTestDriverRef {
  current?: AnimeScheduleOrderingTestDriver;
}

/** One synthetic new-anime row seeded into the board's staging area by a create-mode caller. */
export interface AnimeScheduleOrderingDraftEntry {
  readonly draftId: string;
  readonly name: string;
}

/** Partitioned submit payload split by the `__draft__:` synthetic-id prefix. */
export interface AnimeScheduleOrderingCreateSubmit {
  readonly creates: Readonly<Record<string, readonly AnimeSchedulePlacement[]>>;
  readonly changedNeighbors: readonly ApplyAnimeScheduleDraftEntry[];
}

/** Component contract for the shared anime schedule ordering board. */
export interface AnimeScheduleOrderingProps {
  readonly board: AnimeEditorScheduleBoard;
  readonly feedback?: string;
  readonly isApplying?: boolean;
  readonly onApply?: (entries: readonly ApplyAnimeScheduleDraftEntry[]) => Promise<void>;
  readonly onClose?: () => void;
  readonly testDriverRef?: AnimeScheduleOrderingTestDriverRef;
  /** Existing anime ids to render drag-disabled (still reflow when a draft inserts above them). */
  readonly lockedAnimeIds?: readonly string[];
  /** Create-mode batch rows seeded as draggable staging cards with synthetic ids. */
  readonly draftEntries?: readonly AnimeScheduleOrderingDraftEntry[];
  /** Create-mode submit seam: when provided, apply routes through this instead of `onApply`. */
  readonly onApplyCreateSubmit?: (submit: AnimeScheduleOrderingCreateSubmit) => Promise<void>;
}

/** One draggable card instance inside the shared schedule draft. */
export interface AnimeScheduleOrderingInstance {
  readonly key: string;
  readonly animeId: string;
  readonly name: string;
  readonly baseModifiedAt: number;
  readonly originHighlighted: boolean;
  readonly initialOrder?: number;
  /** True for cards whose drag is disabled (existing neighbors locked by a create-mode caller). */
  readonly locked?: boolean;
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
  readonly stagingCards: readonly AnimeScheduleOrderingInstance[];
  readonly stagedAnimeCount: number;
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
