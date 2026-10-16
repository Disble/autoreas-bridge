import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { IntakeMode, IntakeView } from './intake-panel.types';

/**
 * Names the match status a discarded row returns to when restored, the same
 * derivation the backend's restore uses (the previous status is not stored): a
 * matched page wins, then candidates, otherwise the row is pending again.
 * @param row The discarded row.
 * @returns The status the row will show once restored.
 */
export function getRestoredMatchStatus(row: SeasonAnimeRow): string {
  if (row.matchedSlug !== '') {
    return 'matched';
  }
  return row.candidates.length > 0 ? 'ambiguous' : 'pending';
}

/**
 * Resolves the view the panel shows. The Discarded view exists only in List mode
 * and only while some row is discarded; otherwise the active rows show.
 * @param view The view the user picked.
 * @param discardedCount How many rows are discarded right now.
 * @param mode The current editing mode.
 * @returns The view to show.
 */
export function resolveIntakeView(view: IntakeView, discardedCount: number, mode: IntakeMode): IntakeView {
  return discardedCount === 0 || mode === 'raw' ? 'active' : view;
}

/**
 * Narrows a toggle key to an intake view, so an unknown key changes nothing.
 * @param key The pressed toggle key.
 * @returns The matching view, or undefined for any other key.
 */
export function narrowIntakeView(key: string | number): IntakeView | undefined {
  return key === 'active' || key === 'discarded' ? key : undefined;
}
