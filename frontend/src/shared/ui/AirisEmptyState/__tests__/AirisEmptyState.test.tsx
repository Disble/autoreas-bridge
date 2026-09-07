import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AirisEmptyState } from '../AirisEmptyState';

/** Removes rendered empty-state DOM after each scenario. */
afterEach(() => {
  cleanup();
});

describe('AirisEmptyState', () => {
  it('renders a decorative 512px eager image and invokes the supplied action', () => {
    const onPress = vi.fn();

    render(
      <AirisEmptyState
        imageSrc="/airis-today.webp"
        title="Nothing scheduled today"
        description="Create an anime to start your schedule."
        action={{ label: 'Create an anime', onPress }}
      />,
    );

    const image = document.querySelector('img');
    const action = screen.getByRole('button', { name: 'Create an anime' });

    if (image === null) {
      throw new Error('Expected a decorative Airis image.');
    }
    expect(image).toHaveAttribute('src', '/airis-today.webp');
    expect(image).toHaveAttribute('alt', '');
    expect(image).toHaveAttribute('aria-hidden', 'true');
    expect(image).toHaveAttribute('width', '512');
    expect(image).toHaveAttribute('height', '512');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('decoding', 'async');

    fireEvent.click(action);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the supplied copy without an action button when no action is provided', () => {
    render(
      <AirisEmptyState
        imageSrc="/airis-catalog.webp"
        title="No catalog matches"
        description="Clear the current search and filters to see your anime."
      />,
    );

    expect(screen.getByText('No catalog matches')).toBeInTheDocument();
    expect(screen.getByText('Clear the current search and filters to see your anime.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
