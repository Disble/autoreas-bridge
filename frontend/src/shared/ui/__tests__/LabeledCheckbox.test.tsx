import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LabeledCheckbox } from '../LabeledCheckbox';

describe('LabeledCheckbox', () => {
  afterEach(cleanup);

  it('renders a real, clickable checkbox with its label', () => {
    render(
      <LabeledCheckbox isSelected={false} onChange={vi.fn()}>
        Anime A
      </LabeledCheckbox>,
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    expect(screen.getByText('Anime A')).toBeInTheDocument();
  });

  it('reports selection changes on click', () => {
    const onChange = vi.fn();
    render(
      <LabeledCheckbox isSelected={false} onChange={onChange}>
        Anime A
      </LabeledCheckbox>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
