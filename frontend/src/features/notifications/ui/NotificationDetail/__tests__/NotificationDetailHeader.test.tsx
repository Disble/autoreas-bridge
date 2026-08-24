import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationDetail } from '../../../../../shared/contracts/notification-center.types';
import { NotificationDetailHeader } from '../NotificationDetailHeader';

afterEach(cleanup);

/** Minimal detail fixture builder; every test overrides only what it cares about. */
function buildDetail(overrides: Partial<NotificationDetail> = {}): NotificationDetail {
  return {
    actionCount: 0,
    actions: [],
    body: 'Everything after the failed episode was never attempted.',
    createdAtMs: 1_700_000_000_000,
    id: 1,
    level: 'warning',
    rows: [],
    source: 'Downloads',
    title: 'Download stopped before the season finished',
    ...overrides,
  };
}

describe('NotificationDetailHeader', () => {
  it('renders the title and body', () => {
    render(<NotificationDetailHeader detail={buildDetail()} />);

    expect(screen.getByText('Download stopped before the season finished')).toBeInTheDocument();
    expect(screen.getByText('Everything after the failed episode was never attempted.')).toBeInTheDocument();
  });

  it('renders the source and formatted timestamp together', () => {
    render(<NotificationDetailHeader detail={buildDetail({ source: 'Downloads' })} />);

    expect(screen.getByText(/Downloads/)).toBeInTheDocument();
  });

  it.each([
    ['info', 'Info'],
    ['success', 'Success'],
    ['warning', 'Warning'],
    ['error', 'Error'],
  ])('renders the level %s as its capitalized chip label', (level, expectedLabel) => {
    render(<NotificationDetailHeader detail={buildDetail({ level })} />);

    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });
});
