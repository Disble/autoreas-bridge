import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { createDownloadsWrapper } from '../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';
import { DownloadsRoute } from '../DownloadsRoute';

afterEach(cleanup);

/**
 * Mounts the route with its REAL panels. `DownloadsRoute.test.tsx` mocks all six,
 * so it proves the tab shell and nothing about what the tabs contain — a panel
 * that throws on mount would pass every test in this repo and still blank the
 * whole app window, because there is no error boundary above the routes.
 */
describe('DownloadsRoute boot', () => {
  it('mounts the Downloads tab with real panels without throwing', () => {
    const { container } = render(
      <MemoryRouter>
        <DownloadsRoute />
      </MemoryRouter>,
      { wrapper: createDownloadsWrapper().wrapper },
    );

    expect(container.querySelector('section')).not.toBeNull();
  });
});
