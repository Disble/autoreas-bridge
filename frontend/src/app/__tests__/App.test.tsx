import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../../App';
import { APP_LAYOUT_NAV_GROUPS } from '../../shared/navigation/app-layout.constants';
import { flattenNavItems } from '../../shared/navigation/app-layout.helpers';
import { resetNetworkStore } from '../../shared/store/network-store/network-store.helpers';
import { seasonStore } from '../../shared/store/season-store/season-store.helpers';

describe('App routing', () => {
  beforeEach(() => {
    // Preset the season store so /season resolves synchronously instead of
    // waiting on the real Wails binding timeout in this jsdom integration test.
    seasonStore.setState({ hasLoaded: true, season: null, pastSeasons: [], readOnly: false });
  });

  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('redirects the root path to /today', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('renders the today route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/today']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  describe('legacy route redirects', () => {
    it.each([
      ['/episodes', 'Today'],
      ['/dashboard', 'Today'],
      // /network redirects to Activity, which is now the real TransactionPanel
      // (not the event log NetworkPanel.tsx renders -- NetworkRoute.tsx is
      // pre-existing dead/unrouted drift, see design.md).
      ['/network', 'Activity'],
      ['/status', 'Activity'],
      ['/pairing', 'Devices'],
      ['/preferences', 'Settings'],
    ])('redirects %s to the page headed %s', async (path, label) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );

      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument();
    });
  });

  it('renders the downloads route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();
  });

  it('renders the anime editor route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/editor']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Editor' })).toBeInTheDocument();
  });

  it('resolves /editor/:id to the anime editor workspace', async () => {
    render(
      <MemoryRouter initialEntries={['/editor/anime-1']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Editor' })).toBeInTheDocument();
  });

  it('renders the catalog route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Catalog' })).toBeInTheDocument();
  });

  it('resolves /catalog/detail/:id to the shared AnimeDetail component', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/detail/anime-1']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading anime detail...')).toBeInTheDocument();
  });

  it('renders the history route as its own top-level section', async () => {
    render(
      <MemoryRouter initialEntries={['/history']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'History' })).toBeInTheDocument();
  });

  it('no longer serves History under /catalog/history', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/history']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('renders the devices route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/devices']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();
  });

  it('renders the activity route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/activity']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
  });

  it('redirects the legacy /events deep link to Activity with the integrated runtime-events surface', async () => {
    render(
      <MemoryRouter initialEntries={['/events']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Runtime Events' })).toBeInTheDocument();
  });

  it('renders the season route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/season']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Season' })).toBeInTheDocument();
  });

  it('renders the settings route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('renders a not found route for unknown paths, linking to /today', async () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Today' })).toHaveAttribute('href', '/today');
  });

  describe('grouped rail navigation', () => {
    it('renders exactly 9 nav items across 3 groups in the documented order', async () => {
      render(
        <MemoryRouter initialEntries={['/today']}>
          <App />
        </MemoryRouter>,
      );

      const nav = await screen.findByRole('navigation', { name: 'Bridge primary navigation' });

      expect(within(nav).getAllByRole('link')).toHaveLength(9);
      expect(APP_LAYOUT_NAV_GROUPS).toHaveLength(3);
      expect(APP_LAYOUT_NAV_GROUPS[0]?.items.map((item) => item.label)).toEqual([
        'Today',
        'Downloads',
        'Editor',
        'Catalog',
        'History',
        'Season',
      ]);
      expect(APP_LAYOUT_NAV_GROUPS[1]?.items.map((item) => item.label)).toEqual(['Devices']);
      expect(APP_LAYOUT_NAV_GROUPS[2]?.items.map((item) => item.label)).toEqual(['Activity', 'Settings']);
      expect(APP_LAYOUT_NAV_GROUPS[2]?.pinned).toBe(true);
    });

    it('flattens to 9 items preserving group order for the mobile tab bar', () => {
      const flat = flattenNavItems(APP_LAYOUT_NAV_GROUPS);

      expect(flat).toHaveLength(9);
      expect(flat.map((item) => item.label)).toEqual([
        'Today',
        'Downloads',
        'Editor',
        'Catalog',
        'History',
        'Season',
        'Devices',
        'Activity',
        'Settings',
      ]);
    });
  });

  describe('page header equals nav label', () => {
    it.each([
      ['/today', 'Today'],
      ['/downloads', 'Downloads'],
      ['/editor', 'Editor'],
      ['/catalog', 'Catalog'],
      ['/history', 'History'],
      ['/season', 'Season'],
      ['/devices', 'Devices'],
      ['/activity', 'Activity'],
        ['/settings', 'Settings'],
      ])('the %s page h1 equals its nav label %s', async (path, label) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>,
      );

      expect(await screen.findByRole('heading', { level: 1, name: label })).toBeInTheDocument();
    });
  });
});
