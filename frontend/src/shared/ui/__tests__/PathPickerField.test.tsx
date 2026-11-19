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
  it('renders label, value, description and an icon-only trigger, then reports edits and browse presses', async () => {
    const onBrowse = vi.fn();
    const onChange = vi.fn();
    render(
      <PathPickerField
        browseIcon={folderIcon}
        browseLabel="Choose folder"
        description="Local image file on disk."
        label="Folder"
        value="D:/Anime/Show"
        onBrowse={onBrowse}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByText('Local image file on disk.')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('D:/Anime/Show');
    const trigger = screen.getByRole('button', { name: 'Choose folder' });
    // An icon-only trigger: its name is the label, never visible text, and its tooltip says it.
    expect(trigger).toHaveTextContent(/^$/);
    expect(trigger.querySelector('svg')).not.toBeNull();
    trigger.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Choose folder');

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'D:/Anime/New' } });

    expect(onChange).toHaveBeenCalledWith('D:/Anime/New');
    expect(onBrowse).not.toHaveBeenCalled();

    fireEvent.click(trigger);

    expect(onBrowse).toHaveBeenCalledTimes(1);
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
