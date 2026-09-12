import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KeymapPanelSkeleton } from '../KeymapPanelSkeleton';

describe('KeymapPanelSkeleton', () => {
  it('announces itself through a named live region, because role="status" takes its name from the author and would otherwise compute an empty one', () => {
    render(<KeymapPanelSkeleton />);

    const region = screen.getByRole('status');

    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAccessibleName('Loading keyboard shortcuts...');
  });

  it('renders six row-shaped placeholders, the count the panel reserves', () => {
    render(<KeymapPanelSkeleton />);

    expect(screen.getAllByTestId('keymap-panel-skeleton-row')).toHaveLength(6);
  });

  it('gives every placeholder the same row-shape class the real row carries, which is what makes the height a measurable contract', () => {
    render(<KeymapPanelSkeleton />);

    // Asserted as a literal rather than against KEYMAP_ROW_CLASS: a test that
    // reads the constant it is pinning passes even when the constant changes,
    // which is exactly the drift this assertion exists to catch. The headless
    // measurement in loading-skeletons-fixture.tsx is what proves the height
    // matches; this only proves the class is still shared.
    for (const row of screen.getAllByTestId('keymap-panel-skeleton-row')) {
      expect(row).toHaveClass('rounded-2xl', 'px-4', 'py-4');
    }
  });
});
