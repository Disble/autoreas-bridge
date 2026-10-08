import type { OrderingCard, SeasonAnimeRow, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { WEEKDAYS } from '../OrderingBoard/ordering-board.constants';
import { OVERVIEW_LINEUP_LOAD_ERROR, OVERVIEW_LINEUP_LOADING_STATE } from './overview-panel.constants';
import type { LoadedOverviewLineup, OverviewLineupDay, OverviewLineupState, OverviewLineupView } from './overview-panel.types';

/**
 * Reads the ordering board a closed season stored at close: its final lineup.
 * A source that cannot read the closure snapshot, or a read that throws, is a
 * failure rather than a claim that nothing was recorded.
 *
 * @param source The season port.
 * @param seasonId The closed season being viewed.
 * @returns The settled read, tagged with its season.
 */
export async function readOverviewLineup(source: SeasonSource, seasonId: string): Promise<LoadedOverviewLineup> {
  if (source.getSeasonOrderingSnapshot === undefined) {
    return { seasonId, state: { status: 'failed', errorMessage: OVERVIEW_LINEUP_LOAD_ERROR } };
  }
  try {
    const snapshot = await source.getSeasonOrderingSnapshot(seasonId);
    return { seasonId, state: snapshot.recorded ? { status: 'recorded', grid: snapshot.grid, rail: snapshot.rail } : { status: 'unrecorded' } };
  } catch (error) {
    return { seasonId, state: { status: 'failed', errorMessage: error instanceof Error ? error.message : OVERVIEW_LINEUP_LOAD_ERROR } };
  }
}

/**
 * The lineup state for the viewed season: its own settled read, or loading
 * while none has settled, so a slow read never shows another season's lineup.
 *
 * @param viewSeasonId The closed season being viewed.
 * @param loaded The last settled read, or null.
 * @returns The current lineup state.
 */
export function resolveOverviewLineup(viewSeasonId: string | null, loaded: LoadedOverviewLineup | null): OverviewLineupState {
  return loaded?.seasonId === viewSeasonId ? loaded.state : OVERVIEW_LINEUP_LOADING_STATE;
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
