import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkDetail } from '../NetworkDetail';

/** Removes rendered inspector DOM after each scenario. */
afterEach(() => {
  cleanup();
});

describe('NetworkDetail before a selection', () => {
  it('shows the awaiting-selection pane instead of the tabs', () => {
    render(<NetworkDetail detail={null} detailTab="general" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 3, name: 'No event selected' })).toBeInTheDocument();
    expect(screen.getByText('Pick one in the list to see its metadata and trace.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
