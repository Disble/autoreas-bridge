import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnimeDesktopActions } from '../AnimeDesktopActions';

afterEach(() => {
  cleanup();
});

describe('AnimeDesktopActions', () => {
  it('opens and copies the page and the folder, names the folder path in the tooltip, and tints both', () => {
    const onOpenPage = vi.fn();
    const onCopyPage = vi.fn();
    const onOpenFolder = vi.fn();
    const onCopyFolder = vi.fn();
    render(
      <AnimeDesktopActions
        animeId="anime-1"
        name="Frieren"
        hasPage
        hasFolder
        pageUrl="https://jkanime.net/frieren/"
        folderPath="D:/downloads/frieren"
        onOpenPage={onOpenPage}
        onCopyPage={onCopyPage}
        onOpenFolder={onOpenFolder}
        onCopyFolder={onCopyFolder}
      />,
    );

    expect(screen.getByRole('button', { name: /open page/i }).className).toContain('hover:text-accent');
    expect(screen.getByRole('button', { name: /open folder/i }).className).toContain('hover:text-success');

    fireEvent.click(screen.getByRole('button', { name: /open page/i }));
    expect(onOpenPage).toHaveBeenCalledWith('anime-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /open page/i }));
    expect(onCopyPage).toHaveBeenCalledWith('anime-1');

    fireEvent.click(screen.getByRole('button', { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('anime-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /open folder/i }));
    expect(onCopyFolder).toHaveBeenCalledWith('anime-1');
    expect(onOpenPage).toHaveBeenCalledTimes(1);
    expect(onCopyPage).toHaveBeenCalledTimes(1);

    // The tooltip names the action first and keeps the real path on its second line.
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => screen.getByRole('button', { name: /open folder/i }).focus());
    const lines = screen.getByRole('tooltip').querySelectorAll('span > span');
    expect([...lines].map((line) => line.textContent)).toEqual(['Open folder', 'D:/downloads/frieren']);
  });

  it('hides the page and folder buttons when hasPage/hasFolder are false', () => {
    render(
      <AnimeDesktopActions
        animeId="anime-1"
        name="Frieren"
        hasPage={false}
        hasFolder={false}
        pageUrl=""
        folderPath=""
        onOpenPage={vi.fn()}
        onCopyPage={vi.fn()}
        onOpenFolder={vi.fn()}
        onCopyFolder={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /open page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open folder/i })).not.toBeInTheDocument();
  });

  it('keeps its props contract in a colocated types file with a readonly boundary', () => {
    const sourceText = readFileSync(join(process.cwd(), 'src/shared/ui/AnimeDesktopActions.tsx'), 'utf8');

    expect(sourceText).not.toMatch(/interface\s+AnimeDesktopActionsProps\b/);
    expect(sourceText).toContain('Readonly<AnimeDesktopActionsProps>');
  });

  it('keeps the reusable desktop-actions modules below the frontend file-size ceiling', () => {
    const uiPath = join(process.cwd(), 'src/shared/ui');
    const files = readdirSync(uiPath).filter((fileName) => fileName.startsWith('AnimeDesktopActions'));

    expect(files).not.toEqual([]);

    for (const fileName of files) {
      expect(readFileSync(join(uiPath, fileName), 'utf8').split('\n').length).toBeLessThanOrEqual(500);
    }
  });
});
