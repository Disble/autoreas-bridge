import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../../App';
import { APP_LAYOUT_NAV_ITEMS } from '../../shared/navigation/app-layout.constants';
import { resetNetworkStore } from '../../shared/store/network-store';

describe('App routing', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('redirects the root path to the network route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Network' })).toBeInTheDocument();
  });

  it('renders the network route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Network' })).toBeInTheDocument();
  });

  it('renders Network as the first nav item', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <App />
      </MemoryRouter>,
    );

    const navLinks = await screen.findAllByRole('link', { name: 'Network' });

    expect(navLinks.length).toBeGreaterThan(0);
    expect(navLinks[0]).toHaveAttribute('href', '/network');
  });

  it('renders the dashboard route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Autoreas Bridge' })).toBeInTheDocument();
  });

  it('renders the bridge status route', async () => {
    render(
      <MemoryRouter initialEntries={['/status']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Bridge Status' })).toBeInTheDocument();
    expect(screen.getByText('Local service health')).toBeInTheDocument();
  });

  it('renders the pairing route', async () => {
    render(
      <MemoryRouter initialEntries={['/pairing']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Pair a Device' })).toBeInTheDocument();
    expect(screen.getByText('Scan the QR code from Autoreas Mobile, or use the token below as a manual fallback')).toBeInTheDocument();
  });

  it('renders the downloads route', async () => {
    render(
      <MemoryRouter initialEntries={['/downloads']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Downloads' })).toBeInTheDocument();
  });

  it('renders the chapters route directly', async () => {
    render(
      <MemoryRouter initialEntries={['/chapters']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Chapters' })).toBeInTheDocument();
  });

  it('falls through to not found for the removed observability path', async () => {
    render(
      <MemoryRouter initialEntries={['/observability']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('does not render a Logs navigation entry', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Logs' })).not.toBeInTheDocument();
  });

  it('renders Catalog as the renamed nav entry pointing to /catalog', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <App />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Bridge primary navigation' });
    const catalogLink = within(nav).getByRole('link', { name: 'Catalog' });

    expect(catalogLink).toHaveAttribute('href', '/catalog');
    expect(within(nav).queryByRole('link', { name: 'Animes' })).not.toBeInTheDocument();
  });

  it('renders History as its own nav entry pointing to /history', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <App />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Bridge primary navigation' });
    const historyLink = within(nav).getByRole('link', { name: 'History' });

    expect(historyLink).toHaveAttribute('href', '/history');
  });

  it('keeps exactly 10 primary navigation entries after the Season workspace is added', async () => {
    render(
      <MemoryRouter initialEntries={['/network']}>
        <App />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Bridge primary navigation' });

    expect(within(nav).getAllByRole('link')).toHaveLength(10);
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

  it('does not render a Catalog/History lens switch on /catalog', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <App />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { level: 1, name: 'Catalog' });
    expect(screen.queryByRole('radio', { name: 'Catalog' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'History' })).not.toBeInTheDocument();
  });

  it('no longer serves History under /catalog/history', async () => {
    render(
      <MemoryRouter initialEntries={['/catalog/history']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('keeps exactly 10 primary navigation entries after the Season workspace is added', () => {
    expect(APP_LAYOUT_NAV_ITEMS.length).toBe(10);
  });

  it('renders a not found route for unknown paths', async () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute('href', '/dashboard');
  });
});
