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

  it('renders the cover image and joins format, year and score with a middot when all are known', () => {
    const { container } = render(
      <AnimeMetadataLookupCandidate
        candidate={candidate({ image: 'https://cdn.example/bleach.jpg', mediaType: 'TV', startYear: 2022, score: '8.98' })}
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

  it('renders a bare unselected row with a placeholder, then highlights once selected and reports its malId', () => {
    const onSelect = vi.fn();
    const { container, rerender } = render(
      <AnimeMetadataLookupCandidate candidate={candidate({ malId: 58567 })} isSelected={false} onSelect={onSelect} />,
    );
    const button = screen.getByRole('button');

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByLabelText('No cover art')).toBeInTheDocument();
    expect(button).toHaveTextContent('Bleach: Sennen Kessen-hen');
    expect(button.querySelectorAll('p')).toHaveLength(1);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.className).not.toContain('border-accent');

    rerender(<AnimeMetadataLookupCandidate candidate={candidate({ malId: 58567 })} isSelected onSelect={onSelect} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button').className).toContain('border-accent');
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(58567);
  });
});
