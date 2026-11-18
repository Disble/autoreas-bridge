import { toast } from '@heroui/react';
import type { AnimeDesktopActionResult } from '../../../shared/contracts/anime-editor-source.types';
import { toErrorMessage } from '../../../shared/helpers/error-message.helpers';
import { SEASON_DESKTOP_ACTION_FAILED } from './season-desktop-actions.constants';
import type { SeasonDesktopActionToast } from './season-desktop-actions.types';

/**
 * The toast a completed desktop action shows: a danger toast with the
 * backend's message for a non-ok result, the success toast for a copy that
 * worked, and none for an open that worked (what it opened confirms it).
 * @param result What the action answered.
 * @param successToast The copy confirmation; absent for an open.
 * @returns The toast to show, or `undefined` for none.
 */
export function toDesktopActionToast(result: AnimeDesktopActionResult, successToast: string | undefined): SeasonDesktopActionToast | undefined {
  if (result.status !== 'ok') {
    return { kind: 'danger', message: result.message ?? SEASON_DESKTOP_ACTION_FAILED };
  }
  return successToast === undefined ? undefined : { kind: 'success', message: successToast };
}

/**
 * The danger toast of a rejected desktop action: the bridge's message (the
 * anime module starting or failed included), or the generic failure.
 * @param error What the action rejected with.
 * @returns The danger toast.
 */
export function toDesktopActionFailureToast(error: unknown): SeasonDesktopActionToast {
  return { kind: 'danger', message: toErrorMessage(error, SEASON_DESKTOP_ACTION_FAILED) };
}

/**
 * Shows one desktop-action toast, when there is one.
 * @param shown The toast to show.
 */
export function showDesktopActionToast(shown: SeasonDesktopActionToast | undefined): void {
  if (shown !== undefined) {
    toast[shown.kind](shown.message);
  }
}
