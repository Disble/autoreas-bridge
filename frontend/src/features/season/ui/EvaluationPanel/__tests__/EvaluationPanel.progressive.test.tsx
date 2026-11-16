import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { SeasonAnimeRow } from '../../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { EvaluationPanel } from '../EvaluationPanel';

vi.mock('../../RateAnimeModal/RateAnimeModal', () => ({ RateAnimeModal: () => null }));

/** A created season row for the list-window test. */
function row(index: number): SeasonAnimeRow {
  return { id: String(index), rawName: `Anime ${index}`, animeId: `a${index}`, availability: 'created', matchStatus: '', matchedSlug: '', candidates: [], availableEpisodes: 0, section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: '' };
}

afterEach(() => { vi.restoreAllMocks(); resetSeasonStore(); });

it('renders one progressive batch rather than all candidates', async () => {
  vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockResolvedValue(Array.from({ length: 120 }, (_, index) => row(index)));
  const { wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });
  render(<EvaluationPanel onNavigate={vi.fn()} />, { wrapper });
  await waitFor(() => expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0));
  expect(screen.getAllByRole('listitem').length).toBeLessThan(120);
});
