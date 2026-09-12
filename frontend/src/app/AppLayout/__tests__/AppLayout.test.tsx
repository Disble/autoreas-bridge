import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AppLayout } from '../AppLayout';

vi.mock('../../NotificationToasts', () => ({
  NotificationToasts: () => <div data-testid="notification-toasts" />,
}));

// AppLayout mounts KeyboardDispatcherListener, which now also loads the
// persisted keymap on mount (Slice 4, D11). With no Go binding attached that
// load would poll via a real, unawaited setInterval (wails-bindings.helpers.ts)
// before degrading; stubbing GetKeymap makes it resolve immediately instead.
beforeEach(() => {
  window.go = { desktop: { App: { GetKeymap: () => Promise.resolve('') } } } as never;
});
afterEach(() => {
  Reflect.deleteProperty(window, 'go');
});

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
