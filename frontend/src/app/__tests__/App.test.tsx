import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../../App';

describe('App routing', () => {
  afterEach(() => {
    cleanup();
  });

  it('redirects the root path to the dashboard route', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
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
    expect(screen.getByText('Scan the QR code from Autoreas Mobile or enter the token manually')).toBeInTheDocument();
  });

  it('renders the observability route', async () => {
    render(
      <MemoryRouter initialEntries={['/observability']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: 'Observability' })).toBeInTheDocument();
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
