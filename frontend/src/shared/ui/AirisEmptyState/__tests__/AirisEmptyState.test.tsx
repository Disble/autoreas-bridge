import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AirisEmptyState } from '../AirisEmptyState';
import {
  AIRIS_ARTWORK_CLASS,
  AIRIS_ICON_DISC_CLASS,
  AIRIS_ROW_ICON_DISC_CLASS,
  AIRIS_SECTION_SHELL_CLASS,
  AIRIS_SPLIT_CLASS,
  AIRIS_WAITING_ARTWORK_CLASS,
} from '../airis-empty-state.constants';

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
    render(<AirisEmptyState imageSrc="/airis-catalog.webp" title="Your catalog is empty" description="Create an anime to see it here." />);

    expect(screen.getByRole('heading', { level: 3, name: 'Your catalog is empty' })).toBeInTheDocument();
    expect(screen.getByText('Create an anime to see it here.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('AirisEmptyState artwork failure', () => {
  it.each([undefined, 'section' as const])('drops the %s artwork rather than leaving a broken image, keeping the copy and the action', (size) => {
    render(
      <AirisEmptyState
        imageSrc="/missing-airis.webp"
        title="Nothing scheduled today"
        description="Create an anime to start your schedule."
        action={{ label: 'Create an anime', onPress: vi.fn() }}
        size={size}
      />,
    );

    fireEvent.error(document.querySelector('img') as HTMLImageElement);

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing scheduled today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create an anime' })).toBeInTheDocument();
  });
});

describe('AirisEmptyState layout', () => {
  it('renders a card whose content is a size container holding the split layout', () => {
    const { container } = render(<AirisEmptyState imageSrc="/today.webp" title="Nothing here" description="Create one." />);

    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
    expect(container.querySelector('.\\@container')).not.toBeNull();
    expect(container.querySelector('.\\@container > div')).toHaveAttribute('class', AIRIS_SPLIT_CLASS);
  });

  it('renders a section without a card, on the secondary surface, with the same split layout', () => {
    const { container } = render(<AirisEmptyState imageSrc="/editor.webp" title="No episodes yet" description="Add one." size="section" />);

    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('class', AIRIS_SECTION_SHELL_CLASS);
    expect(container.firstElementChild?.firstElementChild).toHaveAttribute('class', AIRIS_SPLIT_CLASS);
  });

  it.each([
    { kind: undefined, artworkClass: AIRIS_ARTWORK_CLASS },
    { kind: 'first-run' as const, artworkClass: AIRIS_ARTWORK_CLASS },
    { kind: 'waiting-on-step' as const, artworkClass: AIRIS_WAITING_ARTWORK_CLASS },
  ])('sizes the $kind mascot with its own class', ({ kind, artworkClass }) => {
    render(<AirisEmptyState imageSrc="/season.webp" kind={kind} title="Nothing rated yet" description="Rate some." />);

    expect(document.querySelector('img')).toHaveAttribute('class', artworkClass);
  });

  it('gives a mascot kind a primary action', () => {
    render(<AirisEmptyState action={{ label: 'Go to Intake', onPress: vi.fn() }} description="d" imageSrc="/season.webp" kind="waiting-on-step" title="t" />);

    expect(screen.getByRole('button', { name: 'Go to Intake' })).toHaveClass('button--primary');
  });
});

describe('AirisEmptyState icon kinds', () => {
  it('renders filtered with a neutral icon, no mascot, and a secondary clear action', () => {
    const onPress = vi.fn();
    const { container } = render(
      <AirisEmptyState action={{ label: 'Clear search and filters', onPress }} description="No anime matches." kind="filtered" title="No matches" />,
    );

    expect(document.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-airis-icon="filtered"]')).toHaveAttribute('class', AIRIS_ICON_DISC_CLASS.filtered);
    const action = screen.getByRole('button', { name: 'Clear search and filters' });
    expect(action).toHaveClass('button--secondary');
    fireEvent.click(action);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('rejects artwork on an icon kind at compile time', () => {
    // @ts-expect-error icon kinds never take artwork: the mascot is reserved for first-run and waiting-on-step.
    const invalid = <AirisEmptyState description="d" imageSrc="/catalog.webp" kind="filtered" title="t" />;

    expect(invalid.props.kind).toBe('filtered');
  });

  it('renders caught-up with the success icon and no mascot', () => {
    const { container } = render(<AirisEmptyState description="There are no unread notifications." kind="caught-up" title="All caught up" />);

    expect(document.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-airis-icon="caught-up"]')).toHaveAttribute('class', AIRIS_ICON_DISC_CLASS['caught-up']);
    expect(screen.getByRole('heading', { level: 3, name: 'All caught up' })).toBeInTheDocument();
  });
});

describe('AirisEmptyState row', () => {
  it.each([
    { kind: 'first-run' as const },
    { kind: 'waiting-on-step' as const },
  ])('replaces the $kind mascot with a neutral icon in a row', ({ kind }) => {
    const { container } = render(<AirisEmptyState description="Confirm the selection." imageSrc="/season.webp" kind={kind} size="row" title="Nothing to place" />);

    expect(document.querySelector('img')).toBeNull();
    expect(container.querySelector(`[data-airis-icon="${kind}"]`)).toHaveAttribute('class', AIRIS_ROW_ICON_DISC_CLASS[kind]);
    expect(screen.getByRole('heading', { level: 3, name: 'Nothing to place' })).toBeInTheDocument();
    expect(screen.getByText('Confirm the selection.')).toBeInTheDocument();
  });

  it('keeps a small action at the end of the row', () => {
    const onPress = vi.fn();
    render(<AirisEmptyState action={{ label: 'Go to Selection', onPress }} description="d" imageSrc="/season.webp" kind="waiting-on-step" size="row" title="t" />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to Selection' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
