import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDetail as NotificationDetailDTO } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetail } from '../NotificationDetail';

vi.mock('../use-notification-detail-covers', () => ({
  useNotificationDetailCovers: vi.fn().mockReturnValue(new Map()),
}));

afterEach(cleanup);

/** Minimal detail fixture builder, matching the header test's own. */
function buildDetail(overrides: Partial<NotificationDetailDTO> = {}): NotificationDetailDTO {
  return {
    actionCount: 0,
    actions: [],
    body: 'Everything after the failed episode was never attempted.',
    createdAtMs: 1_700_000_000_000,
    id: 1,
    level: 'warning',
    rows: [{ detail: 'Episode 3 failed', name: 'Some Anime', refId: 'anime-1', refType: 'anime', status: 'Stopped' }],
    source: 'Downloads',
    title: 'Download stopped before the season finished',
    ...overrides,
  };
}

describe('NotificationDetail', () => {
  it('prompts to select a notification when detail is null', () => {
    render(<NotificationDetail detail={null} />);

    expect(screen.getByText('Select a notification to see its details.')).toBeInTheDocument();
  });

  it('renders the header and the row-list block for a present detail', () => {
    render(<NotificationDetail detail={buildDetail()} />);

    expect(screen.getByText('Download stopped before the season finished')).toBeInTheDocument();
    expect(screen.getByText('Some Anime')).toBeInTheDocument();
  });
});
