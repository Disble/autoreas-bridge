import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TransactionDetailFieldRow } from '../../TransactionPanel/transaction-panel.types';
import { TransactionDetailFieldList } from '../TransactionDetailFieldList';

/**
 * The four detail panes used to carry four copies of this `dl`. These tests
 * cover what the single copy owes them all: every row reaches the DOM whole.
 *
 * They deliberately do NOT assert the containment classes. jsdom has no layout
 * engine, so `toHaveClass('break-all')` would prove the string is present and
 * nothing about whether anything wrapped. The box is measured in a real browser
 * by `scripts/layout-fixtures/activity-detail-fixture.tsx`.
 */

/** A long unbroken header value, the shape that made the panes overflow. */
const LONG_VALUE = `Bearer ${'0f98a1c47b'.repeat(20)}`;

/** Two rows: an ordinary one and the hostile one, so neither case is assumed. */
const ROWS: readonly TransactionDetailFieldRow[] = [
  { label: 'content-type', value: 'application/json' },
  { label: 'authorization', value: LONG_VALUE },
];

describe('TransactionDetailFieldList', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders every row as a label/value pair', () => {
    render(<TransactionDetailFieldList rows={ROWS} />);

    expect(screen.getByText('content-type')).toBeInTheDocument();
    expect(screen.getByText('application/json')).toBeInTheDocument();
    expect(screen.getByText('authorization')).toBeInTheDocument();
  });

  it('renders a long value whole rather than shortening it', () => {
    render(<TransactionDetailFieldList rows={ROWS} />);

    expect(screen.getByText(LONG_VALUE)).toBeInTheDocument();
  });

  it('renders an empty list without rows', () => {
    const { container } = render(<TransactionDetailFieldList rows={[]} />);

    expect(container.querySelectorAll('dt')).toHaveLength(0);
    expect(container.querySelectorAll('dd')).toHaveLength(0);
  });
});
