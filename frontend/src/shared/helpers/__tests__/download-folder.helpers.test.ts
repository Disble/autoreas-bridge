import { describe, expect, it } from 'vitest';
import { deriveDownloadFolder } from '../download-folder.helpers';

describe('deriveDownloadFolder', () => {
  it('joins the downloads root and a sanitized name segment', () => {
    expect(deriveDownloadFolder('D:\\Anime', 'Frieren')).toBe('D:\\Anime\\Frieren');
    expect(deriveDownloadFolder('/mnt/anime', 'Frieren')).toBe('/mnt/anime/Frieren');
  });

  it('trims trailing separators on the root', () => {
    expect(deriveDownloadFolder('D:\\Anime\\', 'Frieren')).toBe('D:\\Anime\\Frieren');
  });

  it('replaces Windows-illegal characters and collapses whitespace', () => {
    expect(deriveDownloadFolder('D:\\Anime', 'Re:Zero / Season 2')).toBe('D:\\Anime\\Re Zero Season 2');
  });

  it('returns empty when the root is empty or the name sanitizes to nothing', () => {
    expect(deriveDownloadFolder('', 'Frieren')).toBe('');
    expect(deriveDownloadFolder('D:\\Anime', ':::')).toBe('');
  });
});
