import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createModulesTestWrapper } from '../../../shared/query/test-support/bridge-modules.test-support';
import { AppLayout } from '../AppLayout';
import { BRIDGE_READINESS_GATE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';

vi.mock('../../NotificationToasts', () => ({
  NotificationToasts: () => <div data-testid="notification-toasts" />,
}));

// KeyboardDispatcherListener loads the persisted keymap on mount (design
// D11), once the settings module is ready. The readiness gate is stubbed
// ready and GetKeymap attached, so the load resolves at once with no binding
// poll left running; these suites are about the dispatcher, not the loader.
beforeEach(() => {
  vi.spyOn(BRIDGE_READINESS_GATE, 'whenReady').mockResolvedValue();
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
      // The rail's sync chip reads through the backup module; starting, it renders no chip.
      { wrapper: createModulesTestWrapper({ module: 'backup', state: 'starting' }).wrapper },
    );

    expect(screen.getByTestId('notification-toasts')).toBeInTheDocument();
    expect(screen.getByText('Today outlet')).toBeInTheDocument();
  });
});
