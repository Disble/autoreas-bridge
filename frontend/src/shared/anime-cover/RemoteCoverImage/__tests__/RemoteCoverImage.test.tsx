import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RemoteCoverImage } from '../RemoteCoverImage';

/** The fallback a test passes, identified by its test id. */
const FALLBACK = <span data-testid="cover-fallback" />;

describe('RemoteCoverImage', () => {
  afterEach(cleanup);

  it('renders the source as a decorative image, not the fallback', () => {
    render(<RemoteCoverImage data-testid="cover" fallback={FALLBACK} src="https://cdn.example/a.jpg" />);

    const image = screen.getByTestId('cover');
    expect(image).toHaveAttribute('src', 'https://cdn.example/a.jpg');
    expect(image).toHaveAttribute('alt', '');
    expect(screen.queryByTestId('cover-fallback')).not.toBeInTheDocument();
  });

  it('swaps the image for the fallback once the image fails to load', () => {
    render(<RemoteCoverImage data-testid="cover" fallback={FALLBACK} src="https://cdn.example/a.jpg" />);

    fireEvent.error(screen.getByTestId('cover'));

    expect(screen.queryByTestId('cover')).not.toBeInTheDocument();
    expect(screen.getByTestId('cover-fallback')).toBeInTheDocument();
  });
});
