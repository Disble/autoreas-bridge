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
      view: {
        kind: 'ready',
        isRefreshing: false,
        data: [
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
      },
    });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByText('Syncing Now')).toBeInTheDocument();
    expect(screen.getByText('Dungeon Meshi')).toBeInTheDocument();
    expect(screen.getByText('2 pending changes')).toBeInTheDocument();
    expect(screen.getByText('Episode 18 / 24')).toBeInTheDocument();
  });

  it('renders the empty state when no anime is pending', () => {
    useSyncingAnimePanelMock.mockReturnValue({ view: { kind: 'empty' } });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByRole('heading', { level: 3, name: 'Nothing is syncing right now.' })).toBeInTheDocument();
    expect(document.querySelector('[data-airis-icon="caught-up"]')).not.toBeNull();
  });

  it('announces loading through a named status region', () => {
    useSyncingAnimePanelMock.mockReturnValue({ view: { kind: 'loading' } });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByRole('status', { name: 'Loading pending anime queue...' })).toBeInTheDocument();
  });

  it('mirrors the card grid shape with placeholder cards while loading', () => {
    useSyncingAnimePanelMock.mockReturnValue({ view: { kind: 'loading' } });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getAllByTestId('syncing-anime-skeleton-card').length).toBeGreaterThan(0);
  });

  it('does not render the loading status region or placeholder cards once resolved', () => {
    useSyncingAnimePanelMock.mockReturnValue({ view: { kind: 'empty' } });

    const { container } = render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.queryByRole('status', { name: 'Loading pending anime queue...' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('syncing-anime-skeleton-card')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="alert"], .alert')).toBeNull();
  });

  it('renders only the failure Alert when the queue cannot be read', () => {
    useSyncingAnimePanelMock.mockReturnValue({ view: { kind: 'failure', code: 'failed_precondition', message: 'sync: database locked' } });

    render(<SyncingAnimePanel refreshToken={0} />);

    expect(screen.getByText('sync: database locked')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading pending anime queue...' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Nothing is syncing right now.' })).not.toBeInTheDocument();
  });
});
