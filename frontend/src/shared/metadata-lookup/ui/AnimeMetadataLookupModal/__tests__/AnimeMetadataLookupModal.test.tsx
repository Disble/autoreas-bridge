import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnimeMetadataCandidate } from '../../../metadata-lookup.types';
import { AnimeMetadataLookupModal } from '../AnimeMetadataLookupModal';
import {
  METADATA_LOOKUP_ERROR_TITLE,
  METADATA_LOOKUP_LOADING_LABEL,
  METADATA_LOOKUP_TRIGGER_LABEL,
} from '../anime-metadata-lookup.constants';
import type { AnimeMetadataLookupSource, MyAnimeListDetailResultDTO, MyAnimeListSearchResultDTO } from '../use-anime-metadata-lookup';

/**
 * Builds a deferred promise, so a test can hold a search or a confirm fetch
 * in flight for exactly as long as its "loading" assertions need it.
 */
interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

/**
 * Builds a deferred promise.
 * @returns The pending promise and the function that settles it.
 */
function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * Builds one search-result candidate carrying every field the candidate
 * card renders.
 * @param overrides Per-test field replacements.
 * @returns A candidate with a title, format, year and score.
 */
function candidate(overrides: Partial<AnimeMetadataCandidate> = {}): AnimeMetadataCandidate {
  return {
    malId: 41467,
    name: 'Bleach: Sennen Kessen-hen',
    image: 'https://cdn.example/bleach.jpg',
    mediaType: 'TV',
    startYear: 2022,
    score: '8.98',
    ...overrides,
  };
}

/**
 * Builds a fake lookup source whose two calls default to resolving with an
 * empty, successful result, so a test only overrides what it cares about.
 * @param overrides Per-test replacements for either call.
 * @returns A fake source suitable for the modal's injected `source` prop.
 */
function createFakeSource(overrides: Partial<AnimeMetadataLookupSource> = {}): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'MyAnimeList search complete',
      candidates: [],
    } satisfies MyAnimeListSearchResultDTO),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'MyAnimeList detail loaded',
    } satisfies MyAnimeListDetailResultDTO),
    ...overrides,
  };
}

/**
 * Opens the modal by pressing its "Fetch metadata" trigger.
 * @returns Nothing -- the dialog is open once this returns.
 */
function openModal(): void {
  fireEvent.click(screen.getByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL }));
}

/**
 * Types a query into the modal's own search field, past the script-aware
 * floor, so a search request actually fires.
 * @param value The query to type.
 */
function typeQuery(value: string): void {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } });
}

describe('AnimeMetadataLookupModal', () => {
  afterEach(() => {
    cleanup();
  });

  describe('the Fetch metadata trigger', () => {
    it('is disabled while Name is empty', () => {
      render(<AnimeMetadataLookupModal name="" onConfirm={vi.fn()} source={createFakeSource()} />);

      expect(screen.getByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL })).toBeDisabled();
    });

    it('is enabled once Name is non-empty', () => {
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={createFakeSource()} />);

      expect(screen.getByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL })).toBeEnabled();
    });

    it('seeds the search field from Name only on the first open', () => {
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={createFakeSource()} />);

      openModal();

      expect(screen.getByRole('searchbox')).toHaveValue('Bleach');
    });
  });

  describe('the three exclusive candidate-list states -- non-negotiable #11', () => {
    it('shows the loading skeleton and no candidate while a search is in flight', async () => {
      const pending = createDeferred<MyAnimeListSearchResultDTO>();
      const source = createFakeSource({ SearchMyAnimeList: vi.fn().mockReturnValue(pending.promise) });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('bleach');

      expect(await screen.findByRole('status', { name: METADATA_LOOKUP_LOADING_LABEL })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Bleach: Sennen Kessen-hen/ })).toBeNull();
      expect(screen.queryByText(METADATA_LOOKUP_ERROR_TITLE)).toBeNull();
      expect(screen.queryByText(/No MyAnimeList matches/)).toBeNull();
      expect(screen.queryByLabelText('MyAnimeList candidates')).toBeNull();

      pending.resolve({ outcome: 'applied', message: 'ok', candidates: [] });
    });

    it('shows the error alert and neither the skeleton nor candidates when the search fails', async () => {
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'error',
          message: 'MyAnimeList changed its page at "Type:"; metadata autofill cannot continue',
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('bleach');

      expect(await screen.findByText(METADATA_LOOKUP_ERROR_TITLE)).toBeInTheDocument();
      expect(screen.getByText(/MyAnimeList changed its page at "Type:"/)).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('button', { name: /Bleach: Sennen Kessen-hen/ })).toBeNull();
      expect(screen.queryByText(/No MyAnimeList matches/)).toBeNull();
      expect(screen.queryByLabelText('MyAnimeList candidates')).toBeNull();
    });

    it('shows the empty state, naming the query, when the search resolves with zero candidates', async () => {
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'no_op',
          message: 'no MyAnimeList matches found',
          candidates: [],
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('shokuguemi no soma');

      expect(await screen.findByText('No MyAnimeList matches for "shokuguemi no soma"')).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText(METADATA_LOOKUP_ERROR_TITLE)).toBeNull();
      expect(screen.queryByLabelText('MyAnimeList candidates')).toBeNull();
      // D11 -- no recovery action button; the search field above is the recovery control.
      expect(screen.queryByRole('button', { name: /clear|refine|search again/i })).toBeNull();
    });

    it('shows the candidate list, and neither the skeleton, the error, nor the empty state, once resolved with matches', async () => {
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [candidate()],
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('bleach');

      expect(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ })).toBeInTheDocument();
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText(METADATA_LOOKUP_ERROR_TITLE)).toBeNull();
      expect(screen.queryByText(/No MyAnimeList matches/)).toBeNull();
    });

    it('reorders MyAnimeList\'s own order by similarity to the typed query -- design D11', async () => {
      const sequel = candidate({ malId: 58567, name: 'Jujutsu Kaisen: Shimetsu Kaiyuu' });
      const original = candidate({ malId: 40748, name: 'Jujutsu Kaisen' });
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [sequel, original],
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('Jujutsu Kaizen');

      const rendered = await screen.findAllByRole('button', { name: /Jujutsu Kaisen/ });
      expect(rendered).toHaveLength(2);
      expect(rendered[0]).toHaveTextContent('Jujutsu Kaisen');
      expect(rendered[0]).not.toHaveTextContent('Shimetsu Kaiyuu');
    });
  });

  describe('candidate selection and the confirm gate -- non-negotiable #5, UI half', () => {
    it('fires no detail fetch when a candidate is selected without confirming', async () => {
      const detail = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok' } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [candidate()],
        } satisfies MyAnimeListSearchResultDTO),
        GetMyAnimeListDetail: detail,
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('bleach');
      fireEvent.click(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ }));

      expect(detail).not.toHaveBeenCalled();
    });

    it('highlights exactly the pressed candidate, leaving the other row unselected', async () => {
      const sequel = candidate({ malId: 58567, name: 'Jujutsu Kaisen: Shimetsu Kaiyuu' });
      const original = candidate({ malId: 40748, name: 'Jujutsu Kaisen' });
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [sequel, original],
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('Jujutsu Kaisen');
      const rows = await screen.findAllByRole('button', { name: /Jujutsu Kaisen/ });
      fireEvent.click(rows[0]);

      const rowsAfterSelection = screen.getAllByRole('button', { name: /Jujutsu Kaisen/ });
      expect(rowsAfterSelection[0]).toHaveAttribute('aria-pressed', 'true');
      expect(rowsAfterSelection[1]).toHaveAttribute('aria-pressed', 'false');
    });

    it('fetches the detail page and reports a mapped selection only once the primary action is pressed with a candidate selected', async () => {
      const onConfirm = vi.fn();
      const detail = vi.fn().mockResolvedValue({
        outcome: 'applied',
        message: 'ok',
        title: 'Bleach: Sennen Kessen-hen',
        type: 'TV',
        episodes: '13',
        duration: '24',
        source: 'Manga',
        studios: ['Pierrot'],
        genres: ['Action'],
      } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [candidate()],
        } satisfies MyAnimeListSearchResultDTO),
        GetMyAnimeListDetail: detail,
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={onConfirm} source={source} />);

      openModal();
      typeQuery('bleach');
      fireEvent.click(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Use this match' }));

      await vi.waitFor(() => {
        expect(detail).toHaveBeenCalledExactlyOnceWith(41467);
      });
      await vi.waitFor(() => {
        expect(onConfirm).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'Bleach: Sennen Kessen-hen', kind: '0', coverURL: 'https://cdn.example/bleach.jpg' }),
        );
      });
      await vi.waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('keeps the modal open and calls no onConfirm when the detail fetch fails', async () => {
      const onConfirm = vi.fn();
      const detail = vi.fn().mockResolvedValue({
        outcome: 'error',
        message: 'MyAnimeList changed its page at "Type:"; metadata autofill cannot continue',
      } satisfies MyAnimeListDetailResultDTO);
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [candidate()],
        } satisfies MyAnimeListSearchResultDTO),
        GetMyAnimeListDetail: detail,
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={onConfirm} source={source} />);

      openModal();
      typeQuery('bleach');
      fireEvent.click(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Use this match' }));

      expect(await screen.findByText('MyAnimeList changed its page at "Type:"; metadata autofill cannot continue')).toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('disables the primary action until a candidate is selected', async () => {
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [candidate()],
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={source} />);

      openModal();
      typeQuery('bleach');
      await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ });

      expect(screen.getByRole('button', { name: 'Use this match' })).toBeDisabled();
    });
  });

  describe('cancel -- leaves the form byte-identical at the modal level', () => {
    it('closes the modal and calls onConfirm with nothing', async () => {
      const onConfirm = vi.fn();
      const source = createFakeSource({
        SearchMyAnimeList: vi.fn().mockResolvedValue({
          outcome: 'applied',
          message: 'ok',
          candidates: [candidate()],
        } satisfies MyAnimeListSearchResultDTO),
      });
      render(<AnimeMetadataLookupModal name="Bleach" onConfirm={onConfirm} source={source} />);

      openModal();
      typeQuery('bleach');
      fireEvent.click(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
