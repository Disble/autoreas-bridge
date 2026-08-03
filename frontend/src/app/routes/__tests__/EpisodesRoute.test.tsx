import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/episodes/ui/EpisodeSchedulePanel/EpisodeSchedulePanel', () => ({
  EpisodeSchedulePanel: () => <div>Episode schedule panel</div>,
}));

vi.mock('../../../features/season/ui/TodaySeasonBanner/TodaySeasonBanner', () => ({
  TodaySeasonBanner: () => <div>Today season banner</div>,
}));

import { EpisodesRoute } from '../EpisodesRoute';

describe('EpisodesRoute', () => {
  it('renders the Today season banner and episode schedule panel', () => {
    render(<EpisodesRoute />);

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('Today season banner')).toBeInTheDocument();
    expect(screen.getByText('Episode schedule panel')).toBeInTheDocument();
  });
});
