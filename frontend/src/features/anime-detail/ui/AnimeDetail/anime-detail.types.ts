import type { Dispatch, SetStateAction, SyntheticEvent } from 'react';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeDetail as AnimeDetailDto } from '../../../../shared/contracts/anime.types';

/**
 * Props for the shared AnimeDetail component. Reached by route from either
 * the Catalog or History lens; both pass only the anime id.
 */
export interface AnimeDetailProps {
  readonly animeId: string;
  readonly className?: string;
}

/**
 * HeroUI chip color tokens supported by the project's design system (mirrors
 * `HistoryTable`'s `HeroChipColor`, duplicated per this repo's
 * feature-local-constants convention).
 */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/**
 * A single repetition-history entry mapped for display, carrying every field
 * the Legacy "Historial de repetición" record shows (Anime Detail delta
 * spec, "Repetition entry shows the full Legacy record"). Every `*Label`
 * date field already bakes in its explicit "No data" fallback.
 */
export interface AnimeRepeticionViewModel {
  readonly key: string;
  readonly numRepeticion: number;
  readonly estadoLabel: string;
  readonly estadoColor: HeroChipColor;
  readonly episodesWatchedLabel: string;
  readonly creacionLabel: string;
  readonly estrenoLabel: string;
  readonly ultCapVistoLabel: string;
  readonly eliminacionLabel: string;
  readonly repeatedOnLabel: string;
}

/** Props for the dumb `AnimeRepetitionTimeline` subcomponent. */
export interface AnimeRepetitionTimelineProps {
  readonly repetitions: readonly AnimeRepeticionViewModel[];
}

/** A single per-chapter stat tile (label + display-ready value). */
export interface AnimeDetailStatTile {
  readonly label: string;
  readonly value: string;
}

/** View model consumed by the dumb AnimeDetail UI. */
export interface AnimeDetailViewModel {
  readonly id: string;
  readonly nombre: string;
  readonly modifiedAt: number;
  readonly canRepeat: boolean;
  readonly canRestore: boolean;
  readonly portadaUrl?: string;
  readonly estadoLabel: string;
  readonly tipoLabel: string;
  readonly subtitleLabel: string;
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  readonly statTiles: readonly AnimeDetailStatTile[];
  readonly progressRatio?: number;
  readonly paginaUrl?: string;
  readonly carpetaLabel: string;
  readonly estrenoLabel: string;
  readonly creacionLabel: string;
  readonly ultCapVistoLabel: string;
  readonly genres: readonly string[];
  readonly hasGenres: boolean;
  readonly studios: string;
  readonly origin: string;
  readonly isFirstWatch: boolean;
  readonly repetitions: readonly AnimeRepeticionViewModel[];
  readonly hasRepetitionHistory: boolean;
}

/** Discriminates the three states the shared detail can render. */
export type AnimeDetailLoadState = 'loading' | 'loaded' | 'not-found';

/** Destructive anime command selected by the user for explicit confirmation. */
export type AnimeDetailAction = 'repeat' | 'restore';

/** HeroUI Alert status used for mutation outcome feedback. */
export type AnimeDetailFeedbackStatus = 'accent' | 'success' | 'warning' | 'danger';

/** Display-ready confirmation copy for the selected mutation. */
export interface AnimeDetailConfirmationViewModel {
  readonly action: AnimeDetailAction;
  readonly heading: string;
  readonly description: string;
  readonly confirmLabel: string;
}

/** Display-ready feedback for an authoritative mutation result. */
export interface AnimeDetailFeedback {
  readonly status: AnimeDetailFeedbackStatus;
  readonly title: string;
  readonly description: string;
}

/** Pure interpretation of a mutation result, including whether Detail must refresh. */
export interface AnimeDetailMutationResolution {
  readonly feedback: AnimeDetailFeedback;
  readonly shouldRefetch: boolean;
}

/** Cohesive hook-owned state for one pending mutation and its feedback. */
export interface AnimeDetailMutationState {
  readonly animeId: string;
  readonly routeGeneration: number;
  readonly confirmationAction: AnimeDetailAction | undefined;
  readonly feedback: AnimeDetailFeedback | undefined;
  readonly isMutating: boolean;
}

/** Loaded raw detail keyed by route id so prop changes render loading without an effect reset. */
export interface AnimeDetailLoadSnapshot {
  readonly animeId: string;
  readonly detail: AnimeDetailDto | null;
}

/** Inputs for the mutation-focused hook extracted from the Detail query hook. */
export interface AnimeDetailMutationHookProps {
  readonly animeId: string;
  readonly detailSnapshot: AnimeDetailLoadSnapshot | undefined;
  readonly source: BridgeRuntimeSource;
  readonly setDetailSnapshot: Dispatch<SetStateAction<AnimeDetailLoadSnapshot | undefined>>;
}

/** Route-visit identity and guard used by asynchronous AnimeDetail mutations. */
export interface AnimeDetailMutationVisitController {
  readonly routeGeneration: number;
  readonly isActive: (animeId: string, routeGeneration: number) => boolean;
}

/** Mutation-only state and callbacks composed into the public AnimeDetail hook. */
export interface AnimeDetailMutationController {
  readonly confirmation: AnimeDetailConfirmationViewModel | undefined;
  readonly feedback: AnimeDetailFeedback | undefined;
  readonly isMutating: boolean;
  readonly onRequestRepeat: () => void;
  readonly onRequestRestore: () => void;
  readonly onCancelAction: () => void;
  readonly onConfirmationOpenChange: (isOpen: boolean) => void;
  readonly onConfirmAction: () => Promise<void>;
}

/** Props for the dumb action buttons, feedback alert, and confirmation modal. */
export interface AnimeDetailMutationControlsProps extends AnimeDetailMutationController {
  readonly detail: AnimeDetailViewModel;
}

/** State returned by the `useAnimeDetail` hook. */
export interface AnimeDetailState {
  readonly loadState: AnimeDetailLoadState;
  readonly detail: AnimeDetailViewModel | undefined;
  readonly showPortadaPlaceholder: boolean;
  readonly onPortadaError: () => void;
  readonly onPortadaLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  readonly onBack: () => void;
  readonly onEditAnime: () => void;
  readonly confirmation: AnimeDetailConfirmationViewModel | undefined;
  readonly feedback: AnimeDetailFeedback | undefined;
  readonly isMutating: boolean;
  readonly onRequestRepeat: () => void;
  readonly onRequestRestore: () => void;
  readonly onCancelAction: () => void;
  readonly onConfirmationOpenChange: (isOpen: boolean) => void;
  readonly onConfirmAction: () => Promise<void>;
}
