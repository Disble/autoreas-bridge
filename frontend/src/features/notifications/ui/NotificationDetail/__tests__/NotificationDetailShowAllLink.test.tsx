import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationDetailShowAllLink } from '../NotificationDetailShowAllLink';

afterEach(cleanup);

/** Renders the link inside a router that reports which route it landed on, so navigation is observed rather than mocked. */
function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Routes>
        <Route element={<NotificationDetailShowAllLink />} path="/notifications" />
        <Route element={<span>downloads screen</span>} path="/downloads" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('NotificationDetailShowAllLink', () => {
  it("renders the artboard's own way out of a collapsed summary line", () => {
    renderWithRouter();

    expect(screen.getByRole('link', { name: 'show all in Downloads' })).toBeInTheDocument();
  });

  it('navigates to the downloads screen when pressed, rather than being decorative text', async () => {
    renderWithRouter();

    screen.getByRole('link', { name: 'show all in Downloads' }).click();

    await waitFor(() => {
      expect(screen.getByText('downloads screen')).toBeInTheDocument();
    });
  });
});
