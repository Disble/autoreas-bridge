import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LookupCandidateRow } from '../LookupCandidateRow';

describe('LookupCandidateRow', () => {
  afterEach(() => {
    cleanup();
  });

  it.each([
    { subtitle: 'JKAnime · https://jkanime.net/ao-ashi/', lines: 2 },
    { subtitle: '', lines: 1 },
  ])('renders the title and $lines text line(s) for subtitle "$subtitle"', ({ subtitle, lines }) => {
    render(<LookupCandidateRow isSelected={false} subtitle={subtitle} title="Ao Ashi" onPress={vi.fn()} />);

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent(`Ao Ashi${subtitle}`);
    expect(row.querySelectorAll('p')).toHaveLength(lines);
  });

  it.each([true, false])('reports aria-pressed=%s from isSelected', (isSelected) => {
    render(<LookupCandidateRow isSelected={isSelected} subtitle="" title="Ao Ashi" onPress={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', String(isSelected));
  });

  it('swaps a cover that fails to load for the placeholder', () => {
    const { container } = render(
      <LookupCandidateRow image="https://cdn.example/a.jpg" isSelected={false} subtitle="" title="Ao Ashi" onPress={vi.fn()} />,
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image as HTMLImageElement);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('reports a press once', () => {
    const onPress = vi.fn();
    render(<LookupCandidateRow isSelected={false} subtitle="" title="Ao Ashi" onPress={onPress} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledOnce();
  });
});
