import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimeMetadataCandidate } from '../../../metadata-lookup.types';
import { AnimeMetadataLookupCandidate } from '../AnimeMetadataLookupCandidate';

/**
 * Builds one minimal candidate, so each test overrides only the field it is
 * exercising.
 * @param overrides Per-test field replacements.
 * @returns A candidate with a title and no optional fields, unless overridden.
 */
function candidate(overrides: Partial<AnimeMetadataCandidate> = {}): AnimeMetadataCandidate {
  return { malId: 41467, name: 'Bleach: Sennen Kessen-hen', ...overrides };
}

describe('AnimeMetadataLookupCandidate', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the cover image when the search payload carries one', () => {
    const { container } = render(
      <AnimeMetadataLookupCandidate
        candidate={candidate({ image: 'https://cdn.example/bleach.jpg' })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    // The cover is decorative (`alt=""`), so it carries no accessible "img"
    // role -- queried by tag, not by role.
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://cdn.example/bleach.jpg');
    expect(image).toHaveAttribute('width', '40');
    expect(image).toHaveAttribute('height', '40');
    expect(screen.queryByLabelText('No cover art')).toBeNull();
  });

  it('renders the placeholder cover when the search payload carries no image', () => {
    const { container } = render(
      <AnimeMetadataLookupCandidate candidate={candidate()} isSelected={false} onSelect={vi.fn()} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByLabelText('No cover art')).toBeInTheDocument();
  });

  it('joins format, year and score with a middot when all three are known', () => {
    render(
      <AnimeMetadataLookupCandidate
        candidate={candidate({ mediaType: 'TV', startYear: 2022, score: '8.98' })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('TV · 2022 · 8.98')).toBeInTheDocument();
  });

  it('joins only the parts that are known, dropping the rest', () => {
    render(
      <AnimeMetadataLookupCandidate
        candidate={candidate({ mediaType: 'TV', startYear: undefined, score: undefined })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('TV')).toBeInTheDocument();
  });

  it('renders no subtitle line at all when none of the three are known', () => {
    render(
      <AnimeMetadataLookupCandidate
        candidate={candidate({ mediaType: undefined, startYear: undefined, score: undefined })}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).toHaveTextContent('Bleach: Sennen Kessen-hen');
    expect(screen.getByRole('button').querySelectorAll('p')).toHaveLength(1);
  });

  it('calls onSelect with the candidate\'s malId when pressed', () => {
    const onSelect = vi.fn();
    render(<AnimeMetadataLookupCandidate candidate={candidate({ malId: 58567 })} isSelected={false} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(58567);
  });

  it('reports aria-pressed=true and the highlighted style once selected', () => {
    render(<AnimeMetadataLookupCandidate candidate={candidate()} isSelected onSelect={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).toContain('border-accent');
  });

  it('reports aria-pressed=false and no highlighted style while not selected', () => {
    render(<AnimeMetadataLookupCandidate candidate={candidate()} isSelected={false} onSelect={vi.fn()} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.className).not.toContain('border-accent');
  });
});
