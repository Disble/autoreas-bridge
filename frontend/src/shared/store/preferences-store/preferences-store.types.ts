import type { PreferencesSource } from '../../../infrastructure/preferences-source';

/** Zustand state contract for the shared Preferences read-model. */
export type PreferencesStoreState = {
  readonly seasonMode: boolean;
  readonly hasLoaded: boolean;
  readonly errorMessage?: string;
  readonly refresh: (source?: PreferencesSource) => Promise<void>;
};
