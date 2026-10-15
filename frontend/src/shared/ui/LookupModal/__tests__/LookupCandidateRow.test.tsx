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

  it('reports a press once', () => {
    const onPress = vi.fn();
    render(<LookupCandidateRow isSelected={false} subtitle="" title="Ao Ashi" onPress={onPress} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledOnce();
  });
});
