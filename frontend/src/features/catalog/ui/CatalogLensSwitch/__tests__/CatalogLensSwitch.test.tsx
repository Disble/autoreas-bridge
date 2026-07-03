import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { CatalogLensSwitch } from '../CatalogLensSwitch';

afterEach(() => {
  cleanup();
});

describe('CatalogLensSwitch', () => {
  it('renders both lens options', () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CatalogLensSwitch />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: 'Catalog' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'History' })).toBeInTheDocument();
  });

  it('marks Catalog as selected on the /catalog path', () => {
    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <CatalogLensSwitch />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: 'Catalog' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'History' })).toHaveAttribute('aria-checked', 'false');
  });

  it('marks History as selected on the /catalog/history path', () => {
    render(
      <MemoryRouter initialEntries={['/catalog/history']}>
        <CatalogLensSwitch />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: 'History' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Catalog' })).toHaveAttribute('aria-checked', 'false');
  });
});
