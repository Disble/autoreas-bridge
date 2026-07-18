import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { coerceLabeledSelectValue, coerceLabeledSelectValues } from '../LabeledSelect.helpers';
import { LabeledSelect } from '../LabeledSelect';

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'Finalizado' },
];

const genreOptions = [
  { value: 'action', label: 'Action' },
  { value: 'drama', label: 'Drama' },
];

afterEach(() => {
  cleanup();
});

describe('LabeledSelect', () => {
  it('renders the HeroUI select scaffold with a visible label and option text', () => {
    render(
      <LabeledSelect
        ariaLabel="Filter by status"
        fallbackValue="all"
        label="Status"
        options={statusOptions}
        placeholder="Status"
        value="all"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /filter by status/i })).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
  });

  it('coerces an empty single selection back to the caller fallback', () => {
    expect(coerceLabeledSelectValue(null, 'all')).toBe('all');
  });

  it('coerces numeric single selections to the string value expected by feature filters', () => {
    expect(coerceLabeledSelectValue(1, 'all')).toBe('1');
  });

  it('coerces mixed multiple selections to stable string values', () => {
    expect(coerceLabeledSelectValues(['drama', 7])).toEqual(['drama', '7']);
  });

  it('preserves the previous multiple-selection empty value contract', () => {
    expect(coerceLabeledSelectValues(null)).toEqual(['']);
  });

  it('opens the option list from the accessible trigger', () => {
    render(
      <LabeledSelect
        ariaLabel="Filter by status"
        fallbackValue="all"
        label="Status"
        options={statusOptions}
        placeholder="Status"
        value="all"
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /filter by status/i }));

    expect(screen.getByRole('option', { name: 'Finalizado' })).toBeInTheDocument();
  });

  it('forwards single-select props to HeroUI while keeping the fallback change contract', () => {
    const onChange = vi.fn();

    render(
      <LabeledSelect
        ariaLabel="Filter by status"
        data-testid="status-filter"
        fallbackValue="all"
        isDisabled
        label="Status"
        options={statusOptions}
        placeholder="Status"
        value="all"
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button', { name: /filter by status/i });

    expect(trigger).toBeDisabled();
    expect(screen.getByTestId('status-filter')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders multiple selection mode with the expected listbox semantics and forwarded props', () => {
    render(
      <LabeledSelect
        ariaLabel="Filter by genres"
        className="w-full"
        data-testid="genre-filter"
        label="Genres"
        options={genreOptions}
        placeholder="Genres"
        selectionMode="multiple"
        value={['action']}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /filter by genres/i }));

    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getByTestId('genre-filter')).toBeInTheDocument();
  });

  it('keeps props contracts in a colocated types file with a readonly boundary', () => {
    const componentPath = join(process.cwd(), 'src/shared/ui/LabeledSelect.tsx');
    const sourceText = readFileSync(componentPath, 'utf8');

    expect(sourceText).not.toMatch(/interface\s+LabeledSelectProps\b/);
    expect(sourceText).toContain('Readonly<LabeledSelectProps>');
  });

  it('keeps the reusable select modules below the frontend file-size ceiling', () => {
    const uiPath = join(process.cwd(), 'src/shared/ui');
    const labeledSelectFiles = readdirSync(uiPath).filter((fileName) => fileName.startsWith('LabeledSelect'));

    expect(labeledSelectFiles).not.toEqual([]);

    for (const fileName of labeledSelectFiles) {
      const sourceText = readFileSync(join(uiPath, fileName), 'utf8');

      expect(sourceText.split('\n').length).toBeLessThanOrEqual(500);
    }
  });
});
