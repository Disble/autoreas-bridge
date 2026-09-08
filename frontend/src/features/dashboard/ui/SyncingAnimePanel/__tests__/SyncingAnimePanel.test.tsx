import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Stands in for the syncing-anime-panel hook so this suite asserts rendering only. */
const useSyncingAnimePanelMock = vi.fn();

vi.mock('../use-syncing-anime-panel', () => ({
  useSyncingAnimePanel: () => useSyncingAnimePanelMock(),
}));

import { SyncingAnimePanel } from '../SyncingAnimePanel';

describe('SyncingAnimePanel', () => {
  afterEach(cleanup);

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

  it('announces loading through a named status region', () => {
    useSyncingAnimePanelMock.mockReturnValue({ isLoading: true, isEmpty: false, items: [] });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByRole('status', { name: 'Loading pending anime queue...' })).toBeInTheDocument();
  });

  it('mirrors the card grid shape with placeholder cards while loading', () => {
    useSyncingAnimePanelMock.mockReturnValue({ isLoading: true, isEmpty: false, items: [] });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getAllByTestId('syncing-anime-skeleton-card').length).toBeGreaterThan(0);
  });

  it('does not render the loading status region or placeholder cards once resolved', () => {
    useSyncingAnimePanelMock.mockReturnValue({ isLoading: false, isEmpty: true, items: [] });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.queryByRole('status', { name: 'Loading pending anime queue...' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('syncing-anime-skeleton-card')).not.toBeInTheDocument();
  });

  it('renders no syncing card while a refetch keeps the previous item and sets isLoading', () => {
    // The hook is mocked, so this reproduces the exact prop combination a real
    // refetch produces: isLoading flips back to true before the request
    // resolves, but the item from the previous, already-resolved read is
    // still sitting in state until it does. On first mount items start empty,
    // which is why the same bug on other surfaces was invisible until here.
    useSyncingAnimePanelMock.mockReturnValue({
      isLoading: true,
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

    expect(screen.queryByText('Dungeon Meshi')).not.toBeInTheDocument();
    expect(screen.queryByText('2 pending changes')).not.toBeInTheDocument();
  });
});
