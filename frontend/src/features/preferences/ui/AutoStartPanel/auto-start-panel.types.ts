import type { PreferencesSource } from '../../../../infrastructure/preferences-source';

/** Public props contract for the login-launch preferences panel. */
export interface AutoStartPanelProps {
  readonly source?: Pick<PreferencesSource, 'getAutoStartEnabled' | 'setAutoStartEnabled'>;
}
