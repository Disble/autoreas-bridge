import type { Time } from '@internationalized/date';
import type { SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';

/** The two season-port calls the daily check time control drives, injected so a test can fake them. */
export type CheckTimePort = Pick<SeasonSource, 'getCheckTime' | 'setCheckTime'>;

/** The outcome of one save: the saved HH:MM, or the message to show. */
export type CheckTimeSaveResult = { readonly ok: true; readonly time: string } | { readonly ok: false; readonly message: string };

/** The editable value of the time field; `null` while the field is incomplete. */
export type CheckTimeDraft = Time | null;

/** Inputs of the intake card's daily availability check time control. */
export interface IntakeCheckTimeProps {
  /** The check time port; defaults to the runtime season source. */
  readonly source?: CheckTimePort;
}
