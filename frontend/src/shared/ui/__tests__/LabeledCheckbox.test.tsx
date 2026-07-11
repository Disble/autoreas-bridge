import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('keeps props contracts in a colocated types file with a readonly boundary', () => {
    const componentPath = join(process.cwd(), 'src/shared/ui/LabeledCheckbox.tsx');
    const sourceText = readFileSync(componentPath, 'utf8');

    expect(sourceText).not.toMatch(/interface\s+LabeledCheckboxProps\b/);
    expect(sourceText).toContain('Readonly<LabeledCheckboxProps>');
  });
});
