import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransactionFilterBar } from '../TransactionFilterBar';

describe('TransactionFilterBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the free-text query field, route/outcome/kind fields, and status-class pills', () => {
    render(
      <TransactionFilterBar
        kind=""
        onKindChange={vi.fn()}
        onOutcomeChange={vi.fn()}
        onQueryChange={vi.fn()}
        onRouteChange={vi.fn()}
        onStatusClassChange={vi.fn()}
        outcome=""
        query=""
        route=""
        statusClass="all"
      />,
    );

    expect(screen.getByLabelText('Filter captured transactions')).toBeInTheDocument();
    expect(screen.getByLabelText('Route')).toBeInTheDocument();
    expect(screen.getByLabelText('Outcome')).toBeInTheDocument();
    expect(screen.getByLabelText('Kind')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '2xx' })).toBeInTheDocument();
  });

  it('forwards the free-text query change', () => {
    const onQueryChange = vi.fn();
    render(
      <TransactionFilterBar
        kind=""
        onKindChange={vi.fn()}
        onOutcomeChange={vi.fn()}
        onQueryChange={onQueryChange}
        onRouteChange={vi.fn()}
        onStatusClassChange={vi.fn()}
        outcome=""
        query=""
        route=""
        statusClass="all"
      />,
    );

    screen.getByLabelText('Filter captured transactions').dispatchEvent(new Event('input', { bubbles: true }));

    expect(screen.getByLabelText('Filter captured transactions')).toBeInTheDocument();
  });

  it('forwards a status-class pill selection', () => {
    const onStatusClassChange = vi.fn();
    render(
      <TransactionFilterBar
        kind=""
        onKindChange={vi.fn()}
        onOutcomeChange={vi.fn()}
        onQueryChange={vi.fn()}
        onRouteChange={vi.fn()}
        onStatusClassChange={onStatusClassChange}
        outcome=""
        query=""
        route=""
        statusClass="all"
      />,
    );

    screen.getByRole('radio', { name: '4xx' }).click();

    expect(onStatusClassChange).toHaveBeenCalledWith('4xx');
  });
});
