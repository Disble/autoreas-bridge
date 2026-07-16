import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PathPickerField } from '../PathPickerField';

afterEach(() => {
  cleanup();
});

describe('PathPickerField', () => {
  it('renders the label, current path value, and a default Browse trigger', () => {
    render(<PathPickerField label="Folder" value="D:/Anime/Show" onBrowse={vi.fn()} onChange={vi.fn()} />);

    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('D:/Anime/Show');
    expect(screen.getByRole('button', { name: /browse/i })).toBeInTheDocument();
  });

  it('reports typed path edits through onChange', () => {
    const onChange = vi.fn();
    render(<PathPickerField label="Folder" value="" onBrowse={vi.fn()} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D:/Anime/New' } });

    expect(onChange).toHaveBeenCalledWith('D:/Anime/New');
  });

  it('opens the native picker through onBrowse when the trigger is pressed', () => {
    const onBrowse = vi.fn();
    render(<PathPickerField label="Cover file path" value="" onBrowse={onBrowse} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /browse/i }));

    expect(onBrowse).toHaveBeenCalledTimes(1);
  });

  it('supports a caller-provided browse label and optional description', () => {
    render(<PathPickerField browseLabel="Choose file…" description="Local image file on disk." label="Cover file path" value="" onBrowse={vi.fn()} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Choose file…' })).toBeInTheDocument();
    expect(screen.getByText('Local image file on disk.')).toBeInTheDocument();
  });

  it('keeps its props contract in a colocated types file with a readonly boundary', () => {
    const sourceText = readFileSync(join(process.cwd(), 'src/shared/ui/PathPickerField.tsx'), 'utf8');

    expect(sourceText).not.toMatch(/interface\s+PathPickerFieldProps\b/);
    expect(sourceText).toContain('Readonly<PathPickerFieldProps>');
  });

  it('keeps the reusable path picker modules below the frontend file-size ceiling', () => {
    const uiPath = join(process.cwd(), 'src/shared/ui');
    const files = readdirSync(uiPath).filter((fileName) => fileName.startsWith('PathPickerField'));

    expect(files).not.toEqual([]);

    for (const fileName of files) {
      expect(readFileSync(join(uiPath, fileName), 'utf8').split('\n').length).toBeLessThanOrEqual(500);
    }
  });
});
