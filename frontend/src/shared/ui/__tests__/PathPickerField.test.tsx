import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import folderIcon from '@iconify-icons/solar/folder-with-files-bold-duotone';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PathPickerField } from '../PathPickerField';

afterEach(() => {
  cleanup();
});

describe('PathPickerField', () => {
  it('renders the label, current path value, and an icon-only trigger named by its browse label', async () => {
    render(<PathPickerField browseIcon={folderIcon} browseLabel="Choose folder" label="Folder" value="D:/Anime/Show" onBrowse={vi.fn()} onChange={vi.fn()} />);

    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('D:/Anime/Show');
    const trigger = screen.getByRole('button', { name: 'Choose folder' });
    // An icon-only trigger: its name is the label, never visible text, and its tooltip says it.
    expect(trigger).toHaveTextContent(/^$/);
    expect(trigger.querySelector('svg')).not.toBeNull();
    trigger.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Choose folder');
  });

  it('reports typed path edits through onChange', () => {
    const onChange = vi.fn();
    render(<PathPickerField browseIcon={folderIcon} browseLabel="Choose folder" label="Folder" value="" onBrowse={vi.fn()} onChange={onChange} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D:/Anime/New' } });

    expect(onChange).toHaveBeenCalledWith('D:/Anime/New');
  });

  it('opens the native picker through onBrowse when the trigger is pressed', () => {
    const onBrowse = vi.fn();
    render(<PathPickerField browseIcon={folderIcon} browseLabel="Choose cover image" label="Cover file path" value="" onBrowse={onBrowse} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose cover image' }));

    expect(onBrowse).toHaveBeenCalledTimes(1);
  });

  it('renders an optional description', () => {
    render(<PathPickerField browseIcon={folderIcon} browseLabel="Choose cover image" description="Local image file on disk." label="Cover file path" value="" onBrowse={vi.fn()} onChange={vi.fn()} />);

    expect(screen.getByText('Local image file on disk.')).toBeInTheDocument();
  });

  it('disables the input and the trigger together', () => {
    const onBrowse = vi.fn();
    render(<PathPickerField browseIcon={folderIcon} browseLabel="Choose folder" isDisabled label="Folder" value="" onBrowse={onBrowse} onChange={vi.fn()} />);

    expect(screen.getByRole('textbox')).toBeDisabled();
    const trigger = screen.getByRole('button', { name: 'Choose folder' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(onBrowse).not.toHaveBeenCalled();
  });

  it('shows a "(?)" help beside the label only when the caller asks for one', async () => {
    const { rerender } = render(<PathPickerField browseIcon={folderIcon} browseLabel="Choose folder" label="Folder" value="" onBrowse={vi.fn()} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'About the folder' })).toBeNull();

    rerender(<PathPickerField browseIcon={folderIcon} browseLabel="Choose folder" label="Folder" labelHelp={{ label: 'About the folder', message: 'Folder changes do not re-measure.' }} value="" onBrowse={vi.fn()} onChange={vi.fn()} />);
    screen.getByRole('button', { name: 'About the folder' }).focus();

    expect(await screen.findByText('Folder changes do not re-measure.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
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
