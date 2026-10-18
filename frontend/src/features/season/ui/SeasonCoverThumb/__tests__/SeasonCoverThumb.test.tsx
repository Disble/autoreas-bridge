import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SeasonCoverThumb } from '../SeasonCoverThumb';

/** The three mutually exclusive slot contents, by their test id suffix. */
const PARTS = ['image', 'loading', 'placeholder'] as const;

describe('SeasonCoverThumb', () => {
  afterEach(cleanup);

  it.each([
    { part: 'image', coverSrc: 'data:image/png;base64,AA', isLoading: false },
    { part: 'loading', coverSrc: undefined, isLoading: true },
    { part: 'placeholder', coverSrc: undefined, isLoading: false },
  ])('renders only the $part slot', ({ part, coverSrc, isLoading }) => {
    render(<SeasonCoverThumb coverSrc={coverSrc} isLoading={isLoading} />);

    for (const candidate of PARTS) {
      const element = screen.queryByTestId(`season-cover-thumb-${candidate}`);
      if (candidate === part) {
        expect(element).toBeInTheDocument();
      } else {
        expect(element).not.toBeInTheDocument();
      }
    }
  });

  it('renders the given source as a decorative image inside the 44px slot', () => {
    render(<SeasonCoverThumb coverSrc="data:image/png;base64,AA" isLoading={false} />);

    const image = screen.getByTestId('season-cover-thumb-image');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,AA');
    expect(image).toHaveAttribute('alt', '');
    expect(screen.getByTestId('season-cover-thumb')).toHaveClass('size-11', 'rounded-lg');
  });

  it('swaps a cover that fails to load for the placeholder', () => {
    render(<SeasonCoverThumb coverSrc="https://cdn.example/a.jpg" isLoading={false} />);

    fireEvent.error(screen.getByTestId('season-cover-thumb-image'));

    expect(screen.queryByTestId('season-cover-thumb-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('season-cover-thumb-placeholder')).toBeInTheDocument();
  });
});
