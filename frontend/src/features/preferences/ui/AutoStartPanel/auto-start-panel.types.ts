import type { SettingsSource } from '../../../../shared/contracts/settings.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';

/** Public props contract for the login-launch preferences panel. */
export interface AutoStartPanelProps {
  readonly source?: AutoStartSource;
}

/** The `settings` module calls the panel makes: read and save the login-launch preference. */
export type AutoStartSource = Pick<SettingsSource, 'getAutoStartEnabled' | 'setAutoStartEnabled'>;

/** The one state the panel renders for the stored preference: loading, failure or the value. */
export type AutoStartView = AsyncView<boolean>;
