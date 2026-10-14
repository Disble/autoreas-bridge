import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AirisEmptyState } from '../AirisEmptyState';
import { AIRIS_ARTWORK_CLASS, AIRIS_COMPACT_ARTWORK_CLASS, AIRIS_INLINE_ARTWORK_CLASS } from '../airis-empty-state.constants';

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

describe('AirisEmptyState artwork failure', () => {
  it('drops the artwork rather than leaving a broken image, keeping the copy and the action', () => {
    const onPress = vi.fn();

    render(
      <AirisEmptyState
        imageSrc="/missing-airis.webp"
        title="Nothing scheduled today"
        description="Create an anime to start your schedule."
        action={{ label: 'Create an anime', onPress }}
      />,
    );

    const image = document.querySelector('img');
    if (image === null) {
      throw new Error('Expected the artwork before the failure.');
    }

    fireEvent.error(image);

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Nothing scheduled today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create an anime' })).toBeInTheDocument();
  });
});

describe('AirisEmptyState size', () => {
  it.each([
    { size: undefined, hasCard: true, artworkClass: AIRIS_ARTWORK_CLASS },
    { size: 'default' as const, hasCard: true, artworkClass: AIRIS_ARTWORK_CLASS },
    { size: 'compact' as const, hasCard: false, artworkClass: AIRIS_COMPACT_ARTWORK_CLASS },
  ])('renders the $size layout with the same heading and description', ({ size, hasCard, artworkClass }) => {
    const { container } = render(
      <AirisEmptyState imageSrc="/airis-today.webp" title="Nothing left" description="All placed." size={size} />,
    );

    expect(container.querySelector('[data-slot="card"]') !== null).toBe(hasCard);
    expect(document.querySelector('img')).toHaveAttribute('class', artworkClass);
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing left' })).toBeInTheDocument();
    expect(screen.getByText('All placed.')).toBeInTheDocument();
  });

  it('renders the inline layout without a card: 128px artwork beside left-aligned copy and one primary action', () => {
    const onPress = vi.fn();
    const { container } = render(
      <AirisEmptyState imageSrc="/editor.webp" title="No episode durations yet" description="Add one by hand." size="inline" action={{ label: 'Add episode', onPress }} />,
    );

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(document.querySelector('img')).toHaveAttribute('class', AIRIS_INLINE_ARTWORK_CLASS);
    expect(container.firstElementChild).toHaveClass('grid-cols-[auto_minmax(0,1fr)]');
    expect(screen.getByRole('heading', { level: 3, name: 'No episode durations yet' })).toBeInTheDocument();
    expect(screen.getByText('Add one by hand.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the inline copy without a button when no action is provided', () => {
    render(<AirisEmptyState imageSrc="/editor.webp" title="No episode durations yet" description="Add one by hand." size="inline" />);

    expect(screen.getByRole('heading', { level: 3, name: 'No episode durations yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the inline copy and action when its artwork fails', () => {
    render(
      <AirisEmptyState imageSrc="/missing.webp" title="Nothing measured" description="Add by hand." size="inline" action={{ label: 'Add episode', onPress: vi.fn() }} />,
    );

    fireEvent.error(document.querySelector('img') as HTMLImageElement);

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing measured' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add episode' })).toBeInTheDocument();
  });

  it('keeps the compact action and drops its failed artwork', () => {
    const onPress = vi.fn();
    render(
      <AirisEmptyState imageSrc="/missing.webp" title="Nothing left" description="All placed." size="compact" action={{ label: 'Retry', onPress }} />,
    );

    fireEvent.error(document.querySelector('img') as HTMLImageElement);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(document.querySelector('img')).toBeNull();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
