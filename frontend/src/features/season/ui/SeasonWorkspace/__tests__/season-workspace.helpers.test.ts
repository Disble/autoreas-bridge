import { describe, expect, it } from 'vitest';

import type { SeasonSnapshot } from '../../../../../infrastructure/season-source';
import { SEASON_SECTION_TABS } from '../season-workspace.constants';
import { buildSeasonOverview, suggestSeasonName } from '../season-workspace.helpers';

function makeSeason(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    id: 'season-1',
    name: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    status: 'open',
    createdAt: Date.UTC(2026, 6, 6),
    ...overrides,
  };
}

describe('suggestSeasonName', () => {
  it('derives a Spanish month + year label from the date (Excel-sheet convention)', () => {
    expect(suggestSeasonName(new Date(2026, 6, 1))).toBe('Julio 2026');
    expect(suggestSeasonName(new Date(2025, 0, 15))).toBe('Enero 2025');
    expect(suggestSeasonName(new Date(2024, 9, 3))).toBe('Octubre 2024');
  });
});

describe('buildSeasonOverview', () => {
  it('maps an open season to a success status', () => {
    const overview = buildSeasonOverview(makeSeason());
    expect(overview.title).toBe('Julio 2026');
    expect(overview.statusLabel).toBe('Open');
    expect(overview.statusColor).toBe('success');
    expect(overview.minApprovalGrade).toBe(4);
    expect(overview.slots).toBe(12);
    expect(overview.createdLabel.length).toBeGreaterThan(0);
  });

  it('maps a closed season to a neutral status', () => {
    const overview = buildSeasonOverview(makeSeason({ status: 'closed' }));
    expect(overview.statusLabel).toBe('Closed');
    expect(overview.statusColor).toBe('default');
  });
});

describe('SEASON_SECTION_TABS', () => {
  it('starts with an available Overview and marks later sections as upcoming', () => {
    expect(SEASON_SECTION_TABS[0]).toMatchObject({ id: 'overview', available: true });

    const ids = SEASON_SECTION_TABS.map((tab) => tab.id);
    expect(ids).toEqual(['overview', 'intake', 'daily', 'evaluation', 'selection', 'ordering']);

    const available = SEASON_SECTION_TABS.filter((tab) => tab.available).map((tab) => tab.id);
    expect(available).toEqual(['overview', 'intake', 'daily', 'evaluation']);
  });
});
