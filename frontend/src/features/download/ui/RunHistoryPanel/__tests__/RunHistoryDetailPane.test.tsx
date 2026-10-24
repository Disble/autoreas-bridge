import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RunHistoryDetailPane } from '../RunHistoryDetailPane';

/** Removes rendered pane DOM after each scenario. */
afterEach(() => {
  cleanup();
});

describe('RunHistoryDetailPane before a selection', () => {
  it('shows the awaiting-selection prompt and no run detail', () => {
    render(<RunHistoryDetailPane covers={new Map()} detail={undefined} onCopy={vi.fn()} onEditAnime={vi.fn()} onOpenLink={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 3, name: 'No run selected' })).toBeInTheDocument();
    expect(screen.getByText('Pick a run to see its counters and links.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy run id' })).not.toBeInTheDocument();
  });
});
