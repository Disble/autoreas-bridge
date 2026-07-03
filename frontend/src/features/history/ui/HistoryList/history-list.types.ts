import type { AnimeRepeticion } from '../../../../shared/contracts/anime.types';

/** Props for the read-only HistoryList component. */
export interface HistoryListProps {
  readonly className?: string;
}

/**
 * Minimal shape needed to decide History membership and build a card.
 * Merges the slim catalog progress fields (from `getAnimes`) with the
 * detail-only `repetir` timeline (from `getAnimeDetail`) -- see
 * `history-list.helpers.ts` for why both are required.
 */
export interface HistoryCandidate {
  readonly id: string;
  readonly nombre: string;
  readonly nrocapvisto: number;
  readonly totalcap?: number;
  readonly repetir?: readonly AnimeRepeticion[];
}

/** A single repetition-history entry mapped for display in a History card. */
export interface HistoryRepetitionViewModel {
  readonly key: string;
  readonly numRepeticion: number;
  readonly repeatedOnLabel: string;
}

/** View model for a single History card. */
export interface HistoryEntryViewModel {
  readonly id: string;
  readonly nombre: string;
  readonly progressLabel: string;
  readonly repetitionCount: number;
  readonly repetitions: readonly HistoryRepetitionViewModel[];
}

/**
 * State returned by `useHistoryList`. Deliberately has NO mutation/callback
 * field -- History is read-only and drill-down to detail is a `Link`
 * (routing composition) in the dumb component, not a hook callable.
 */
export interface HistoryListState {
  readonly items: readonly HistoryEntryViewModel[];
  readonly isLoading: boolean;
  readonly isEmpty: boolean;
}
