import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/episodes/ui/EpisodeSchedulePanel/EpisodeSchedulePanel', () => ({
  /** Stands in for the panel, rendering the banner slot the route hands it. */
  EpisodeSchedulePanel: ({ banner }: { readonly banner?: ReactNode }) => <div>Episode schedule panel{banner}</div>,
}));

vi.mock('../../../features/season/ui/TodaySeasonBanner/TodaySeasonBanner', () => ({
  /** Stands in for the season banner. */
  TodaySeasonBanner: () => <div>Today season banner</div>,
}));

import { EpisodesRoute } from '../EpisodesRoute';

describe('EpisodesRoute', () => {
  it('slots the Today season banner into the episode schedule panel', () => {
    render(<EpisodesRoute />);

    expect(screen.getByText('Episode schedule panel')).toContainElement(screen.getByText('Today season banner'));
  });
});
