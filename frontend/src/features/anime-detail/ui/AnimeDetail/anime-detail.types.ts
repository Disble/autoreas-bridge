/**
 * Props for the shared AnimeDetail component. Reached by route from either
 * the Catalog or History lens; both pass only the anime id.
 */
export interface AnimeDetailProps {
  readonly animeId: string;
  readonly className?: string;
}

/** A single repetition-history entry mapped for display. */
export interface AnimeRepeticionViewModel {
  readonly key: string;
  readonly numRepeticion: number;
  readonly progressLabel: string;
  readonly repeatedOnLabel: string;
}

/** View model consumed by the dumb AnimeDetail UI. */
export interface AnimeDetailViewModel {
  readonly id: string;
  readonly nombre: string;
  readonly progressLabel: string;
  readonly genres: readonly string[];
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
}
