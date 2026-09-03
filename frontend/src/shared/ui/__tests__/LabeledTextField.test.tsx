import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LabeledTextField } from '../LabeledTextField';

afterEach(() => {
  cleanup();
});

describe('LabeledTextField', () => {
  it('renders the label and current value in a text input by default', () => {
    render(<LabeledTextField label="Origin" value="Manga" onChange={vi.fn()} />);

    expect(screen.getByText('Origin')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Manga');
  });

  it('reports typed edits through onChange as the raw string value', () => {
    const onChange = vi.fn();
    render(<LabeledTextField label="Origin" value="" onChange={onChange} />);

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

  it('renders the rejection through the field error slot', () => {
    render(<LabeledTextField errorMessage="That name is taken." label="Name" value="x" onChange={() => {}} />);

    expect(screen.getByText('That name is taken.')).toBeInTheDocument();
  });

  it('says nothing when the value is accepted', () => {
    render(<LabeledTextField description="Helper text." label="Name" value="x" onChange={() => {}} />);

    expect(screen.getByText('Helper text.')).toBeInTheDocument();
    expect(screen.queryByText('That name is taken.')).not.toBeInTheDocument();
  });
});
