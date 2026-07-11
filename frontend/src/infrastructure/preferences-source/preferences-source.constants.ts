import type { PreferencesSource } from './preferences-source.types';

/** Module-local singleton container for the shared preferences source. */
export const PREFERENCES_SOURCE_STATE: { sharedSource: PreferencesSource | null } = {
  sharedSource: null,
};
