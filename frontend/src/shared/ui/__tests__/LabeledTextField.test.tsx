import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LabeledTextField } from '../LabeledTextField';

afterEach(() => {
  cleanup();
});

describe('LabeledTextField', () => {
  it('renders the label and value in a text input by default, and reports typed edits as the raw string', () => {
    const onChange = vi.fn();
    render(<LabeledTextField label="Origin" value="Manga" onChange={onChange} />);

    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Manga');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Light novel' } });

    expect(onChange).toHaveBeenCalledWith('Light novel');
  });

  it('renders an optional description and placeholder', () => {
    render(<LabeledTextField description="External cover image URL." label="Cover image URL" placeholder="https://..." value="" onChange={vi.fn()} />);

    expect(screen.getByText('External cover image URL.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();
  });

  it('supports a numeric input with a minimum bound', () => {
    render(<LabeledTextField label="Duration" min={1} type="number" value="24" onChange={vi.fn()} />);

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue(24);
    expect(input).toHaveAttribute('min', '1');
  });

  it('keeps its props contract in a colocated types file with a readonly boundary', () => {
    const sourceText = readFileSync(join(process.cwd(), 'src/shared/ui/LabeledTextField.tsx'), 'utf8');

    expect(sourceText).not.toMatch(/interface\s+LabeledTextFieldProps\b/);
    expect(sourceText).toContain('Readonly<LabeledTextFieldProps>');
  });
});

describe('LabeledTextField rejection', () => {
  afterEach(cleanup);

  it('says nothing while the value is accepted, then renders a rejection through the field error slot', () => {
    const { rerender } = render(<LabeledTextField description="Helper text." label="Name" value="x" onChange={() => {}} />);

    expect(screen.getByText('Helper text.')).toBeInTheDocument();
    expect(screen.queryByText('That name is taken.')).not.toBeInTheDocument();

    rerender(<LabeledTextField errorMessage="That name is taken." label="Name" value="x" onChange={() => {}} />);

    expect(screen.getByText('That name is taken.')).toBeInTheDocument();
  });
});
