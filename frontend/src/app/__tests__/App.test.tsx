import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../../App';
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
