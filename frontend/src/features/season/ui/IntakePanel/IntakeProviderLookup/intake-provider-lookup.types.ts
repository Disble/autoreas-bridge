import type { SeasonProviderPage, SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import type { LookupModalState } from '../../../../../shared/ui/LookupModal/lookup-modal.types';

/** The one season-port call the provider lookup drives, injected so a test can fake it. */
export type ProviderSearchPort = Pick<SeasonSource, 'searchProviders'>;

/**
 * One immutable snapshot of the provider search: a single discriminant plus
 * the data that belongs to it, so no reachable state carries `loading` beside
 * the previous query's pages.
 */
export interface ProviderLookupSnapshot {
  readonly state: LookupModalState;
  readonly pages: readonly SeasonProviderPage[];
  /** The failed search's status message; `''` in every other state. */
  readonly errorMessage: string;
}

/**
 * One provider page ready to render as a candidate row: its title and URL, a
 * `<provider label> · <page URL without its scheme>` subtitle, its cover when
 * the provider showed one, and whether it is the highlighted page.
 */
export type ProviderPageView = Pick<SeasonProviderPage, 'pageUrl' | 'title'> &
  Readonly<{ subtitle: string; image: string | undefined; isSelected: boolean }>;

/** Inputs of one intake row's "Find on provider" lookup. */
export interface IntakeProviderLookupProps {
  /** The row's raw name, seeded into the search field on the first open only. */
  readonly rawName: string;
  /** The provider search the modal drives. */
  readonly source: ProviderSearchPort;
  /** Resolves the row to the confirmed page URL. */
  readonly onResolve: (pageUrl: string) => void;
}
