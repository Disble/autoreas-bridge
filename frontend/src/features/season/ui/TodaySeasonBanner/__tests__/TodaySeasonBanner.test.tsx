import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

const useTodaySeasonBanner = vi.fn();

vi.mock('../use-today-season-banner', () => ({
  useTodaySeasonBanner: () => useTodaySeasonBanner(),
}));

import { TodaySeasonBanner } from '../TodaySeasonBanner';

describe('TodaySeasonBanner', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('renders a link to /season while a season is open', () => {
    useTodaySeasonBanner.mockReturnValue(true);

    render(
      <MemoryRouter>
        <TodaySeasonBanner />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/season');
  });

  it('renders nothing while no season is open', () => {
    useTodaySeasonBanner.mockReturnValue(false);

    const { container } = render(
      <MemoryRouter>
        <TodaySeasonBanner />
      </MemoryRouter>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
