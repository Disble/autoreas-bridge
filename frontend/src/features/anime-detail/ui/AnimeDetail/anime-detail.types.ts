import type { SyntheticEvent } from 'react';

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

/** State returned by the `useAnimeDetail` hook. */
export interface AnimeDetailState {
  readonly loadState: AnimeDetailLoadState;
  readonly detail: AnimeDetailViewModel | undefined;
  readonly showPortadaPlaceholder: boolean;
  readonly onPortadaError: () => void;
  readonly onPortadaLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
  readonly onBack: () => void;
}
