import type { OrderingCard, SeasonAnimeRow, SeasonOrderingSnapshot } from '../../../../shared/contracts/season.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import { WEEKDAYS } from '../OrderingBoard/ordering-board.constants';
import { OVERVIEW_LINEUP_LOAD_ERROR, OVERVIEW_LINEUP_LOADING_STATE } from './overview-panel.constants';
import type { OverviewLineupDay, OverviewLineupState, OverviewLineupView } from './overview-panel.types';

/**
 * The lineup state for the viewed closed season from its closure snapshot
 * read. A source that cannot read the snapshot, or a failed read, is a failure
 * rather than a claim that nothing was recorded; a read in flight, or no closed
 * season viewed, is loading.
 *
 * @param viewSeasonId The closed season being viewed, or null.
 * @param canRead Whether the source can read the closure snapshot at all.
 * @param snapshot The viewed season's snapshot read.
 * @returns The current lineup state.
 */
export function toOverviewLineupState(
  viewSeasonId: string | null,
  canRead: boolean,
  snapshot: AsyncView<SeasonOrderingSnapshot>,
): OverviewLineupState {
  if (viewSeasonId === null) {
    return OVERVIEW_LINEUP_LOADING_STATE;
  }
  if (!canRead) {
    return { status: 'failed', errorMessage: OVERVIEW_LINEUP_LOAD_ERROR };
  }
  if (snapshot.kind === 'failure') {
    return { status: 'failed', errorMessage: snapshot.message };
  }
  if (snapshot.kind !== 'ready') {
    return OVERVIEW_LINEUP_LOADING_STATE;
  }
  return snapshot.data.recorded ? { status: 'recorded', grid: snapshot.data.grid, rail: snapshot.data.rail } : { status: 'unrecorded' };
}

/**
 * Groups the stored weekday cards Lunes to Domingo, each day in stored order,
 * with the season-owned grade joined by anime id. Days without a card and
 * cards outside the weekdays are left out.
 *
 * @param grid The stored weekday cards.
 * @param rows The season's rows, the owner of each grade.
 * @returns The non-empty weekdays.
 */
function groupLineupDays(grid: readonly OrderingCard[], rows: readonly SeasonAnimeRow[]): OverviewLineupDay[] {
  const grades = new Map(rows.map((row) => [row.animeId, row.grade]));
  return WEEKDAYS.map((day) => ({
    day,
    items: grid
      .filter((card) => card.dia === day)
      .toSorted((left, right) => left.orden - right.orden)
      .map((card) => {
        const grade = grades.get(card.animeId) ?? 0;
        return { key: `${day}-${card.animeId}`, animeId: card.animeId, name: card.name, grade: grade >= 1 ? grade : null };
      }),
  })).filter((day) => day.items.length > 0);
}

/**
 * Summarizes the recorded lineup: how many distinct animes it schedules and,
 * when any approved anime was left on the rail, how many.
 *
 * @param days The non-empty weekdays.
 * @param unplacedCount The rail cards the board stored.
 * @returns The one-line summary.
 */
function formatLineupSummary(days: readonly OverviewLineupDay[], unplacedCount: number): string {
  const scheduled = new Set(days.flatMap((day) => day.items.map((item) => item.animeId))).size;
  const summary = `${scheduled} ${scheduled === 1 ? 'anime' : 'animes'}, as scheduled when the season closed`;
  return unplacedCount > 0 ? `${summary} · ${unplacedCount} left unplaced` : summary;
}

/**
 * Derives what the final lineup card renders from the lineup read: exactly one
 * display state, with the weekdays and summary only when a lineup exists.
 *
 * @param state Where the lineup read stands.
 * @param rows The season's rows, the owner of each grade.
 * @returns The card's render model.
 */
export function buildOverviewLineupView(state: OverviewLineupState, rows: readonly SeasonAnimeRow[]): OverviewLineupView {
  if (state.status !== 'recorded') {
    // Only a failed read carries an errorMessage, so spreading the rest of the
    // state is what fills it there and leaves it undefined everywhere else.
    const { status, ...rest } = state;
    return { display: status, errorMessage: undefined, ...rest, days: [], summary: '' };
  }
  const days = groupLineupDays(state.grid, rows);
  if (days.length === 0) {
    return { display: 'empty', errorMessage: undefined, days, summary: '' };
  }
  return { display: 'lineup', errorMessage: undefined, days, summary: formatLineupSummary(days, state.rail.length) };
}

/**
 * Lists the anime id of every lineup entry in render order, so the card can
 * ask for each cover.
 *
 * @param view The card's render model.
 * @returns The rendered anime ids.
 */
export function listLineupAnimeIds(view: OverviewLineupView): string[] {
  return view.days.flatMap((day) => day.items.map((item) => item.animeId));
}
