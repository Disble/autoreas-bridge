import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const useSyncingAnimePanelMock = vi.fn();

vi.mock('../use-syncing-anime-panel', () => ({
  useSyncingAnimePanel: () => useSyncingAnimePanelMock(),
}));

import { SyncingAnimePanel } from '../SyncingAnimePanel';

describe('SyncingAnimePanel', () => {
  it('renders a populated syncing anime list', () => {
    useSyncingAnimePanelMock.mockReturnValue({
      isLoading: false,
      isEmpty: false,
      items: [
        {
          animeId: 'anime-7',
          title: 'Dungeon Meshi',
          changeLabel: 'Updated',
          changeTone: 'warning',
          queueLabel: '2 pending changes',
          progressLabel: 'Episode 18 / 24',
          changedFields: ['nrocapvisto'],
          lastUpdatedLabel: '2026-06-20 18:15:00',
        },
      ],
    });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByText('Syncing Now')).toBeInTheDocument();
    expect(screen.getByText('Dungeon Meshi')).toBeInTheDocument();
    expect(screen.getByText('2 pending changes')).toBeInTheDocument();
    expect(screen.getByText('Episode 18 / 24')).toBeInTheDocument();
  });

  it('renders the empty state when no anime is pending', () => {
    useSyncingAnimePanelMock.mockReturnValue({
      isLoading: false,
      isEmpty: true,
      items: [],
    });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByText('Nothing is syncing right now.')).toBeInTheDocument();
  });
});
