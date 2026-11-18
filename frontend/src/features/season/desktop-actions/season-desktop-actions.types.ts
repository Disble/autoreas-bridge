import type { AnimeDesktopActionResult } from '../../../shared/contracts/anime-editor-source.types';

/** One desktop action of the anime module: open or copy an anime's page or folder. */
export type SeasonDesktopAction = (animeId: string) => Promise<AnimeDesktopActionResult>;

/** What the desktop-action mutation runs: the action and the anime it acts on. */
export interface SeasonDesktopActionRequest {
  /** The port method to call. */
  readonly action: SeasonDesktopAction;
  /** The anime the action opens or copies. */
  readonly animeId: string;
}

/** The toast a finished desktop action shows: a success for a copy, a danger for a failure. */
export interface SeasonDesktopActionToast {
  /** Which HeroUI toast variant to show. */
  readonly kind: 'success' | 'danger';
  /** The toast text. */
  readonly message: string;
}

/** The anime page and folder desktop actions a season card or row offers. */
export interface SeasonDesktopActions {
  /** Opens the anime's page in the browser. */
  readonly onOpenPage: (animeId: string) => void;
  /** Copies the anime's page URL. */
  readonly onCopyPage: (animeId: string) => void;
  /** Opens the anime's download folder. */
  readonly onOpenFolder: (animeId: string) => void;
  /** Copies the anime's download folder path. */
  readonly onCopyFolder: (animeId: string) => void;
}
