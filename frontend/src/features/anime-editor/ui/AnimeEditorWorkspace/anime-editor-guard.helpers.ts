import type { EpisodeDurationSaveResult } from '../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { AnimeEditorSaveResult } from '../../../../shared/contracts/anime.types';
import type { AnimeEditorGuardCardSave } from './anime-editor-workspace.types';
import { isIntentionalEditorOutcome } from './anime-editor-workspace.helpers';

/**
 * Reads an Episodes card save the way the unsaved-changes guard reads an anime
 * save: `applied` and `no_op` let the pending action continue, an error stops it.
 */
export function toEpisodesGuardResult(result: EpisodeDurationSaveResult | undefined): AnimeEditorSaveResult | undefined {
  if (result === undefined) return undefined;
  return { outcome: result.outcome, message: result.message ?? '' };
}

/**
 * The answer "Save and continue" continues on, after each dirty card saved on
 * its own (S15): the first card whose save did not end applied or no_op, so the
 * pending action stays and that card keeps its error; otherwise the last answer.
 */
export function combineGuardSaveResults(results: readonly (AnimeEditorSaveResult | undefined)[]): AnimeEditorSaveResult | undefined {
  const failed = results.findIndex((result) => result === undefined || !isIntentionalEditorOutcome(result));
  if (failed >= 0) return results[failed];
  return results.at(-1) ?? { outcome: 'no_op', message: '' };
}

/**
 * "Save and continue" (S15): saves each dirty card on its own, in order, and
 * answers what the guard continues on. A clean card is not saved at all.
 */
export async function saveDirtyCards(cards: readonly AnimeEditorGuardCardSave[]): Promise<AnimeEditorSaveResult | undefined> {
  const results: (AnimeEditorSaveResult | undefined)[] = [];
  for (const card of cards) {
    if (card.isDirty) results.push(await card.save());
  }
  return combineGuardSaveResults(results);
}

/** Whether any card holds the flag: the one guard is dirty, or saving, when either card is. */
export function isAnyCard(...flags: readonly boolean[]): boolean {
  return flags.includes(true);
}
