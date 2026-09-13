import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMetadataSelection } from '../../../../../shared/metadata-lookup/metadata-lookup.types';
import { useAnimeCreateRows } from '../use-anime-create-rows';

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: {
    pickFolder: vi.fn(),
    pickFile: vi.fn(),
  },
}));

describe('useAnimeCreateRows -- metadata autofill (SDD-70 slice 6)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('D10 -- name autofill re-derives folder through the existing onRowChange channel', () => {
    it('re-derives folder from the applied name when folderManual is false', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      const draftId = result.current.rows[0].draftId;
      expect(result.current.rows[0].folderManual).toBe(false);

      act(() => result.current.onRowChange(draftId, { name: 'Attack on Titan' }));

      const row = result.current.rows.find((candidate) => candidate.draftId === draftId);
      expect(row?.folder).toBe('D:\\Anime\\Attack on Titan');
      expect(row?.folderManual).toBe(false);
    });

    it('keeps folder byte-identical when folderManual is true', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      const draftId = result.current.rows[0].draftId;

      act(() => result.current.onRowChange(draftId, { folder: 'D:\\Anime\\Custom' }));
      expect(result.current.rows.find((candidate) => candidate.draftId === draftId)?.folderManual).toBe(true);

      act(() => result.current.onRowChange(draftId, { name: 'Attack on Titan' }));

      const row = result.current.rows.find((candidate) => candidate.draftId === draftId);
      expect(row?.folder).toBe('D:\\Anime\\Custom');
      expect(row?.folderManual).toBe(true);
    });
  });

  describe('applied/undo state (D9)', () => {
    it('confirming a candidate patches the row through onRowChange and stores its pre-image', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      const draftId = result.current.rows[0].draftId;
      act(() => result.current.onRowChange(draftId, { folder: 'D:\\Anime\\Manual' }));

      const selection: AnimeMetadataSelection = {
        name: 'Bleach: Sennen Kessen-hen',
        duration: '24',
        unfilled: ['kind', 'studios'],
      };
      act(() => result.current.onMetadataApplied(draftId, selection));

      const row = result.current.rows.find((candidate) => candidate.draftId === draftId);
      expect(row?.name).toBe('Bleach: Sennen Kessen-hen');
      expect(row?.duration).toBe('24');

      const applied = result.current.appliedMetadataByRow[draftId];
      expect(applied?.patch).toEqual({ name: 'Bleach: Sennen Kessen-hen', duration: '24' });
      expect(applied?.previous).toEqual({ name: '', duration: '' });
      expect(applied?.unfilled).toEqual(['kind', 'studios']);
    });

    it('undo replays the pre-image through onRowChange, reverting exactly the applied fields', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      const draftId = result.current.rows[0].draftId;
      act(() => result.current.onRowChange(draftId, { folder: 'D:\\Anime\\Manual' }));

      const selection: AnimeMetadataSelection = {
        name: 'Bleach: Sennen Kessen-hen',
        duration: '24',
        unfilled: [],
      };
      act(() => result.current.onMetadataApplied(draftId, selection));
      act(() => result.current.onMetadataUndo(draftId));

      const row = result.current.rows.find((candidate) => candidate.draftId === draftId);
      expect(row?.name).toBe('');
      expect(row?.duration).toBe('');
      expect(row?.folder).toBe('D:\\Anime\\Manual');
      expect(result.current.appliedMetadataByRow[draftId]).toBeUndefined();
    });
  });

  describe('multiple rows -- the targeted draftId, never a different row', () => {
    it('records the targeted row\'s own pre-image, not a different row\'s, when a second row exists', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      act(() => result.current.onAddRow());
      const [firstId, secondId] = result.current.rows.map((row) => row.draftId);
      act(() => result.current.onRowChange(firstId, { duration: '10' }));
      act(() => result.current.onRowChange(secondId, { duration: '20' }));

      act(() => result.current.onMetadataApplied(secondId, { name: 'Bleach', duration: '24', unfilled: [] }));

      expect(result.current.appliedMetadataByRow[secondId]?.previous.duration).toBe('20');
      expect(result.current.appliedMetadataByRow[firstId]).toBeUndefined();
    });

    it('clears only the undone row\'s entry, leaving a second row\'s pending Undo intact', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      act(() => result.current.onAddRow());
      const [firstId, secondId] = result.current.rows.map((row) => row.draftId);
      act(() => result.current.onMetadataApplied(firstId, { name: 'Bleach', unfilled: [] }));
      act(() => result.current.onMetadataApplied(secondId, { name: 'Naruto', unfilled: [] }));

      act(() => result.current.onMetadataUndo(firstId));

      expect(result.current.appliedMetadataByRow[firstId]).toBeUndefined();
      expect(result.current.appliedMetadataByRow[secondId]).toBeDefined();
      expect(result.current.rows.find((row) => row.draftId === secondId)?.name).toBe('Naruto');
    });
  });

  describe('guards against a draftId with nothing to act on', () => {
    it('does nothing when onMetadataApplied targets a draftId that does not exist', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));

      expect(() => act(() => result.current.onMetadataApplied('missing-draft-id', { name: 'Bleach', unfilled: [] }))).not.toThrow();

      expect(result.current.appliedMetadataByRow).toEqual({});
    });

    it('does nothing when onMetadataUndo targets a row with nothing applied', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      const draftId = result.current.rows[0].draftId;

      expect(() => act(() => result.current.onMetadataUndo(draftId))).not.toThrow();

      expect(result.current.rows[0].name).toBe('');
    });
  });

  describe('never-touched set -- non-negotiable #7, Create surface', () => {
    it('leaves Download page, a manual Folder, and Watched episodes unchanged after confirming a candidate', () => {
      const { result } = renderHook(() => useAnimeCreateRows('D:\\Anime'));
      const draftId = result.current.rows[0].draftId;
      act(() => result.current.onRowChange(draftId, {
        page: 'https://example.test/bleach',
        folder: 'D:\\Anime\\Manual',
        episodesWatched: '12',
      }));

      const selection: AnimeMetadataSelection = {
        name: 'Bleach: Sennen Kessen-hen',
        kind: '0',
        totalEpisodes: '25',
        duration: '24',
        origin: 'Manga',
        genres: 'Action',
        studios: 'Pierrot',
        coverURL: 'https://cdn.example/bleach.jpg',
        unfilled: [],
      };
      act(() => result.current.onMetadataApplied(draftId, selection));

      const row = result.current.rows.find((candidate) => candidate.draftId === draftId);
      expect(row?.page).toBe('https://example.test/bleach');
      expect(row?.folder).toBe('D:\\Anime\\Manual');
      expect(row?.episodesWatched).toBe('12');
    });
  });
});
