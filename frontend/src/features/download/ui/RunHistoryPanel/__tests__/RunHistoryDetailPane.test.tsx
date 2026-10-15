import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RunHistoryDetailPane } from '../RunHistoryDetailPane';

/** Removes rendered pane DOM after each scenario. */
afterEach(() => {
  cleanup();
});

describe('RunHistoryDetailPane before a selection', () => {
  it('shows the awaiting-selection pane with the run counters it will fill', () => {
    const { container } = render(<RunHistoryDetailPane selectedRun={undefined} />);

    expect(screen.getByRole('heading', { level: 3, name: 'No run selected' })).toBeInTheDocument();
    expect(screen.getByText('Pick a run to see its counters and links.')).toBeInTheDocument();
    const preview = container.querySelector('[data-awaiting-preview]');
    expect(Array.from(preview?.querySelectorAll('dt') ?? []).map((node) => node.textContent)).toEqual(['Checked', 'Skipped', 'Up to date']);
    expect(preview).toHaveTextContent('Episodes');
  });
});
