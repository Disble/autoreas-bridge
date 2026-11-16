import type { Key } from 'react';
import type { SeasonSnapshot } from '../../../../shared/contracts/season.types';
import { SEASON_MONTHS_ES, SEASON_SECTION_TABS } from './season-workspace.constants';
import type { PastSeasonEntry, SeasonOverview, SeasonSectionId } from './season-workspace.types';

/**
 * Narrows a HeroUI selection key to a tab identifier declared by this workspace.
 */
export function narrowSeasonSectionId(key: Key): SeasonSectionId | undefined {
  return SEASON_SECTION_TABS.find((section) => section.id === key)?.id;
}

/**
 * Derives the suggested season name from a date using the 10-year Excel-sheet
 * naming convention: Spanish month + year (e.g. "Julio 2026"). Returned as a
 * data literal; the user can override it when creating the season.
 */
export function suggestSeasonName(now: Date): string {
  return `${SEASON_MONTHS_ES[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Formats a created-at epoch (ms) as a human-readable date label. Falls back to
 * an empty string for a missing timestamp so the UI never renders "Invalid Date".
 */
export function formatSeasonCreatedLabel(createdAt: number): string {
  if (!createdAt) {
    return '';
  }
  return new Date(createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Builds the Overview view model for an open or closed season: an "Open" season
 * reads as success, a "Closed" one as neutral. The nota mínima de aprobación and
 * slots are shown read-only here (they are edited on the Selection board).
 */
function buildSeasonOverview(season: SeasonSnapshot): SeasonOverview {
  const isOpen = season.status === 'open';
  return {
    title: season.name,
    statusLabel: isOpen ? 'Open' : 'Closed',
    statusColor: isOpen ? 'success' : 'default',
    createdLabel: formatSeasonCreatedLabel(season.createdAt),
    minApprovalGrade: season.minApprovalGrade,
    slots: season.slots,
  };
}

/**
 * Builds the past-seasons history rows (in the order received — newest first
 * from the backend), each with its status chip color and created-date label,
 * for the no-open-season view where the user picks one to open read-only.
 */
export function buildPastSeasonEntries(seasons: readonly SeasonSnapshot[]): readonly PastSeasonEntry[] {
  return seasons.map((season) => {
    const isOpen = season.status === 'open';
    return {
      id: season.id,
      name: season.name,
      statusLabel: isOpen ? 'Open' : 'Closed',
      statusColor: isOpen ? 'success' : 'default',
      createdLabel: formatSeasonCreatedLabel(season.createdAt),
    };
  });
}

/**
 * Whether the workspace reads the past-seasons history: only once the live
 * season read answered with no open season, and never inside a past-season view.
 * @param isSeasonRead Whether the displayed season read succeeded.
 * @param season The displayed season, or null when none is open.
 * @param readOnly Whether a past season is being viewed.
 * @returns Whether the history read is enabled.
 */
export function isSeasonListWanted(isSeasonRead: boolean, season: SeasonSnapshot | null, readOnly: boolean): boolean {
  return isSeasonRead && season === null && !readOnly;
}

/**
 * The overview card of the displayed season.
 * @param season The displayed season, or null when none is open.
 * @returns The card's view model, or null without a season.
 */
export function toSeasonOverview(season: SeasonSnapshot | null): SeasonOverview | null {
  return season ? buildSeasonOverview(season) : null;
}
