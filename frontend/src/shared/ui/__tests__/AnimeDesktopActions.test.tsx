import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnimeDesktopActions } from '../AnimeDesktopActions';

afterEach(() => {
  cleanup();
});

describe('AnimeDesktopActions', () => {
  it('opens the page on press and copies it on secondary click', () => {
    const onOpenPage = vi.fn();
    const onCopyPage = vi.fn();
    render(
      <AnimeDesktopActions
        animeId="anime-1"
        name="Frieren"
        hasPage
        hasFolder={false}
        pageUrl="https://jkanime.net/frieren/"
        folderPath=""
        onOpenPage={onOpenPage}
        onCopyPage={onCopyPage}
        onOpenFolder={vi.fn()}
        onCopyFolder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open page/i }));
    expect(onOpenPage).toHaveBeenCalledWith('anime-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /open page/i }));
    expect(onCopyPage).toHaveBeenCalledWith('anime-1');
  });

  it('opens the folder on press and copies it on secondary click', () => {
    const onOpenFolder = vi.fn();
    const onCopyFolder = vi.fn();
    render(
      <AnimeDesktopActions
        animeId="anime-1"
        name="Frieren"
        hasPage={false}
        hasFolder
        pageUrl=""
        folderPath="D:/downloads/frieren"
        onOpenPage={vi.fn()}
        onCopyPage={vi.fn()}
        onOpenFolder={onOpenFolder}
        onCopyFolder={onCopyFolder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('anime-1');

    fireEvent.contextMenu(screen.getByRole('button', { name: /open folder/i }));
    expect(onCopyFolder).toHaveBeenCalledWith('anime-1');
  });

  it('tints the buttons with the page/folder intent colors', () => {
    render(
      <AnimeDesktopActions
        animeId="anime-1"
        name="Frieren"
        hasPage
        hasFolder
        pageUrl="https://jkanime.net/frieren/"
        folderPath="D:/downloads/frieren"
        onOpenPage={vi.fn()}
        onCopyPage={vi.fn()}
        onOpenFolder={vi.fn()}
        onCopyFolder={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /open page/i }).className).toContain('hover:text-accent');
    expect(screen.getByRole('button', { name: /open folder/i }).className).toContain('hover:text-success');
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
