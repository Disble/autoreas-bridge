import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppLayout } from '../AppLayout';

vi.mock('../../NotificationToasts', () => ({
  NotificationToasts: () => <div data-testid="notification-toasts" />,
}));

describe('AppLayout', () => {
  it('renders the toast host, navigation, and routed outlet', () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/today" element={<div>Today outlet</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('notification-toasts')).toBeInTheDocument();
    expect(screen.getByText('Today outlet')).toBeInTheDocument();
  });
});
