import type { Dispatch, ReactNode, SetStateAction, SyntheticEvent } from 'react';
import type { contracts } from '../../../../../wailsjs/go/models';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';
import type { AnimeDetail as AnimeDetailDto } from '../../../../shared/contracts/anime.types';
import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';

/**
 * Props for the shared AnimeDetail component. Reached by route from either
 * the Catalog or History lens; both pass only the anime id.
 */
export interface AnimeDetailProps {
  readonly animeId: string;
  readonly className?: string;
}

/** Props for the shape-mirroring `AnimeDetailSkeleton` loading placeholder. */
export interface AnimeDetailSkeletonProps {
  readonly className?: string;
}

/**
 * HeroUI chip color tokens supported by the project's design system,
 * duplicated per this repo's feature-local-constants convention.
 */
export type HeroChipColor = 'accent' | 'default' | 'success' | 'warning' | 'danger';

/** View model consumed by the dumb AnimeDetail UI. */
export interface AnimeDetailViewModel {
  readonly id: string;
  readonly nombre: string;
  readonly modifiedAt: number;
  readonly canRepeat: boolean;
  readonly canRestore: boolean;
  readonly hasStoredCover: boolean;
  /** Alt text of the resolved cover: `Cover of <name>`. */
  readonly coverAlt: string;
  /** Accessible names of the toolbar actions: `Repeat <name>`, `Restore <name>`, `Edit <name>`. */
  readonly repeatLabel: string;
  readonly restoreLabel: string;
  readonly editLabel: string;
  readonly estadoLabel: string;
  readonly estadoColor: HeroChipColor;
  readonly tipoLabel: string;
  readonly statusLabel: string;
  readonly statusColor: HeroChipColor;
  /** `12 of 28 episodes`, or the watched count with the no-total fallback. */
  readonly progressCountLabel: string;
  /** `Duration · 24 min`, or the no-duration fallback. */
  readonly durationLabel: string;
  /** 0-100 watched ratio; `undefined` without a total, so no progress bar renders. */
  readonly progressRatio: number | undefined;
  readonly paginaUrl?: string;
  /** Whether a folder path exists to show and copy. */
  readonly hasFolder: boolean;
  readonly carpetaLabel: string;
  readonly estrenoLabel: string;
  readonly creacionLabel: string;
  readonly ultCapVistoLabel: string;
  readonly genres: readonly string[];
  readonly hasGenres: boolean;
  readonly studios: string;
  readonly origin: string;
  readonly isFirstWatch: boolean;
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

/** Props for the dumb feedback alert and confirmation modal of the Repeat/Restore mutations. */
export interface AnimeDetailMutationControlsProps extends AnimeDetailMutationController {
  readonly detail: AnimeDetailViewModel;
}

/** A desktop-action binding such as `copyAnimeFolder` or `openAnimePage`, keyed by anime id. */
export type AnimeDetailDesktopAction = (animeId: string) => Promise<contracts.EpisodeCommandResult>;

/** The toasts one desktop action raises: an optional success and a required failure. */
export interface AnimeDetailDesktopActionFeedback {
  readonly success?: string;
  readonly failure: string;
}

/** The desktop-action bindings Detail uses; each is optional, and an absent one fails closed. */
export type AnimeDetailDesktopActionSource = Pick<BridgeRuntimeSource, 'copyAnimeFolder' | 'openAnimePage'>;

/** The Detail callbacks that leave the app: copy the folder path, open the page in the default browser. */
export interface AnimeDetailDesktopActions {
  readonly onCopyFolder: () => Promise<void>;
  readonly onOpenPage: () => Promise<void>;
}

/** A toast to raise through the global HeroUI toast queue. */
export interface AnimeDetailToast {
  readonly status: 'success' | 'danger';
  readonly message: string;
}

/** Props for the main card's toolbar: Back on the left, Repeat/Restore/Edit on the right. */
export interface AnimeDetailToolbarProps {
  readonly detail: AnimeDetailViewModel;
  readonly isMutating: boolean;
  readonly onBack: () => void;
  readonly onEditAnime: () => void;
  readonly onRequestRepeat: () => void;
  readonly onRequestRestore: () => void;
}

/** Props for the cover frame's content: skeleton, resolved art, or the no-cover poster. */
export interface AnimeDetailCoverProps {
  readonly cover: AnimeCoverEntry;
  readonly coverAlt: string;
  readonly onPortadaError: () => void;
  readonly onPortadaLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
}

/** Props for the identity block (title, type and chips) and the General data card. */
export interface AnimeDetailSectionProps {
  readonly detail: AnimeDetailViewModel;
}

/** Props for the General data card, which owns the Folder copy action and the Page link. */
export interface AnimeDetailGeneralDataProps extends AnimeDetailSectionProps, AnimeDetailDesktopActions {}

/** Props for one General data field: a caption over its value. */
export interface AnimeDetailFieldProps {
  readonly label: string;
  /** Spans every column of the field grid. */
  readonly isWide?: boolean;
  readonly children: ReactNode;
}

/** Props for the main card: toolbar, cover, identity and General data. */
export type AnimeDetailMainCardProps = Omit<AnimeDetailState, 'loadState' | 'detail' | 'detailSource' | 'confirmation' | 'feedback' | 'onCancelAction' | 'onConfirmationOpenChange' | 'onConfirmAction'> & {
  readonly detail: AnimeDetailViewModel;
};

/** State returned by the `useAnimeDetail` hook. */
export interface AnimeDetailState {
  readonly loadState: AnimeDetailLoadState;
  readonly detail: AnimeDetailViewModel | undefined;
  /** Raw detail DTO backing `detail`, exposed so Watch history derives per-watch view models at the same freshness. `null` when the anime was not found; the section mounts only when this is non-null. */
  readonly detailSource: AnimeDetailDto | null | undefined;
  readonly cover: AnimeCoverEntry;
  readonly onPortadaError: () => void;
  readonly onPortadaLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  readonly onBack: () => void;
  readonly onEditAnime: () => void;
  readonly onCopyFolder: () => Promise<void>;
  readonly onOpenPage: () => Promise<void>;
  readonly confirmation: AnimeDetailConfirmationViewModel | undefined;
  readonly feedback: AnimeDetailFeedback | undefined;
  readonly isMutating: boolean;
  readonly onRequestRepeat: () => void;
  readonly onRequestRestore: () => void;
  readonly onCancelAction: () => void;
  readonly onConfirmationOpenChange: (isOpen: boolean) => void;
  readonly onConfirmAction: () => Promise<void>;
}
