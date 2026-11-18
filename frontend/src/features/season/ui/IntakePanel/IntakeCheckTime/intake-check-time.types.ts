import type { Time } from '@internationalized/date';
import type { SettingsSource } from '../../../../../shared/contracts/settings.types';

/**
 * The two settings-port calls the daily check time control drives, injected so
 * a test can fake them: the read rejects while the `settings` module is not
 * ready or the read failed, and the save rejects with why it was refused.
 */
export type CheckTimePort = Pick<SettingsSource, 'getSeasonCheckTime' | 'setSeasonCheckTime'>;

/** What one Save sends: the HH:MM, or the message shown instead of a backend call. */
export type CheckTimeSaveRequest = { readonly ok: true; readonly time: string } | { readonly ok: false; readonly message: string };

/** The editable value of the time field; `null` while the field is incomplete. */
export type CheckTimeDraft = Time | null;

/** Inputs of the intake card's daily availability check time control. */
export interface IntakeCheckTimeProps {
  /** The check time port; defaults to the runtime settings source. */
  readonly source?: CheckTimePort;
}
