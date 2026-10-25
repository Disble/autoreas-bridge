import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EpisodeDurationRow,
  EpisodeDurationRuntimeSource,
  EpisodeDurationSaveResult,
  EpisodeDurationSection,
  EpisodeReanalysisProgress,
  EpisodeReanalysisReview,
} from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { EPISODE_DURATIONS_LOADING_LABEL, EPISODE_DURATIONS_SKELETON_ROW_COUNT } from '../episode-durations-section.constants';
import type { UseEpisodeDurationsSectionOptions } from '../episode-durations-section.types';
import { EpisodeDurationsSection } from '../EpisodeDurationsSection';
import { useEpisodeDurationsSection } from '../use-episode-durations-section';

afterEach(cleanup);

/**
 * Builds one measured row.
 * @param episode The episode number.
 * @param minutes Whole minutes, or 0 for no value.
 * @returns The row.
 */
function row(episode: number, minutes: number): EpisodeDurationRow {
  return { episode, durationMs: minutes * 60_000, minutes, long: minutes > 30, source: minutes > 0 ? 'measured' : 'not_measured' };
}

/**
 * Builds a found-folder TV section.
 * @param overrides Fields to replace.
 * @returns The section.
 */
function section(overrides: Partial<EpisodeDurationSection> = {}): EpisodeDurationSection {
  return { outcome: 'ok', folderStatus: 'found', beyondTotal: [], tv: true, rows: [row(1, 47), row(2, 24), row(3, 23)], ...overrides };
}

/** A fake source plus the hooks a test drives it with. */
interface FakeSource {
  readonly source: EpisodeDurationRuntimeSource;
  readonly emitProgress: (progress: EpisodeReanalysisProgress) => void;
  readonly settleReview: (review: EpisodeReanalysisReview) => void;
}

/**
 * Builds a source whose section read uses `getSection`, whose re-analysis
 * stays pending until the test settles it, and whose save answers with `save`.
 * @param getSection The section binding.
 * @param save The save binding; defaults to an applied save.
 * @returns The fake source.
 */
function createFakeSource(
  getSection: EpisodeDurationRuntimeSource['getEpisodeDurationSection'],
  save: EpisodeDurationRuntimeSource['saveEpisodeDurations'] = vi.fn().mockResolvedValue({ outcome: 'applied', changed: 1 } satisfies EpisodeDurationSaveResult),
): FakeSource {
  let listener: (progress: EpisodeReanalysisProgress) => void = () => undefined;
  let settle: (review: EpisodeReanalysisReview) => void = () => undefined;
  return {
    source: {
      getEpisodeDurationSection: getSection,
      reanalyzeEpisodeDurations: vi.fn(() => new Promise<EpisodeReanalysisReview>((resolve) => { settle = resolve; })),
      cancelEpisodeReanalysis: vi.fn().mockResolvedValue(undefined),
      saveEpisodeDurations: save,
      onEpisodeReanalysisProgress: vi.fn((next: (progress: EpisodeReanalysisProgress) => void) => { listener = next; return () => undefined; }),
    },
    emitProgress: (progress) => listener(progress),
    settleReview: (review) => settle(review),
  };
}

/** Props of the test harness: the saved anime and the fake source. */
interface HarnessProps {
  readonly options: UseEpisodeDurationsSectionOptions;
  readonly source: EpisodeDurationRuntimeSource;
}

/**
 * Renders the real section hook into the real component.
 * @param props The saved anime and the source.
 * @returns The card.
 */
function Harness({ options, source }: Readonly<HarnessProps>) {
  const viewModel = useEpisodeDurationsSection(options, source);
  return <EpisodeDurationsSection viewModel={viewModel} />;
}

/**
 * Renders the card for one saved anime.
 * @param fake The fake source.
 * @param overrides Saved fields to replace.
 * @returns The render result.
 */
function renderSection(fake: FakeSource, overrides: Partial<UseEpisodeDurationsSectionOptions> = {}) {
  const options: UseEpisodeDurationsSectionOptions = { animeId: 'anime-1', folder: 'D:/Anime/Oshi no Ko', totalEpisodes: '12', kind: '0', ...overrides };
  return render(<Harness options={options} source={fake.source} />);
}

/** Shows the Episodes table. */
function expand(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Show episodes' }));
}

/**
 * Sets episode 3 to `minutes` through the Edit modal.
 * @param minutes The minutes typed.
 */
async function editEpisodeThree(minutes: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit episode 3 duration' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: minutes } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
}

describe('EpisodeDurationsSection card header', () => {
  it('shows the title, the description, the measured and long chips, and a collapsed Show episodes toggle', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section())));

    expect(screen.getByRole('heading', { name: 'Episodes' })).toBeInTheDocument();
    expect(screen.getByText('Duration of each episode. Saved on its own, apart from the anime data.')).toBeInTheDocument();
    expect(await screen.findByText('3 of 3 measured')).toBeInTheDocument();
    expect(screen.getByText('1 long')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Show episodes' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // The disclosure is the quietest level (ghost); Re-analyze is a gray secondary action above it.
    expect(toggle).toHaveClass('button--ghost');
    expect(screen.getByRole('button', { name: 'Re-analyze folder' })).toHaveClass('button--tertiary');
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save episodes' })).toBeNull();
  });

  it('shows and hides the table with an expanded state on the toggle', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section())));

    expand();
    const hide = screen.getByRole('button', { name: 'Hide episodes' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('aria-controls', 'episode-durations-body');
    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3));
    fireEvent.click(hide);

    expect(screen.queryAllByTestId('episode-durations-row')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Show episodes' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing while no record is loaded', () => {
    renderSection(createFakeSource(vi.fn()), { animeId: undefined });

    expect(screen.queryByRole('heading', { name: 'Episodes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show episodes' })).toBeNull();
  });
});

describe('EpisodeDurationsSection exclusive states', () => {
  it('shows a labelled skeleton table while loading, with no real row, then only the real rows', async () => {
    let resolve: (value: EpisodeDurationSection) => void = () => undefined;
    const getSection = vi.fn(() => new Promise<EpisodeDurationSection>((next) => { resolve = next; }));
    const { container } = renderSection(createFakeSource(getSection));
    expand();

    expect(await screen.findByRole('status', { name: EPISODE_DURATIONS_LOADING_LABEL })).toBeInTheDocument();
    expect(screen.getAllByTestId('episode-durations-skeleton-row')).toHaveLength(EPISODE_DURATIONS_SKELETON_ROW_COUNT);
    expect(screen.queryAllByTestId('episode-durations-row')).toHaveLength(0);
    expect(container.querySelector('[data-slot="table"][aria-busy="true"]')).not.toBeNull();
    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(1));
    await act(async () => resolve(section()));

    expect(screen.queryByRole('status', { name: EPISODE_DURATIONS_LOADING_LABEL })).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryAllByTestId('episode-durations-skeleton-row')).toHaveLength(0);
    expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Add episode' })).toBeInTheDocument();
  });

  // Regression: react-stately below 3.49 reset a removed focused row with a `while` that never
  // ended when every remaining row was disabled, which the loading skeleton rows are. The
  // renderer froze at 100% CPU with no error. A focused row must survive the reload.
  it('reloads into the skeleton and back after a row had focus, without freezing', async () => {
    const getSection = vi.fn().mockResolvedValue(section());
    const fake = createFakeSource(getSection);
    const { rerender } = renderSection(fake, { totalEpisodes: '' });
    expand();
    const editButton = await screen.findByRole('button', { name: 'Edit episode 3 duration' });
    const focusedRow = editButton.closest('[role="row"]') as HTMLElement;
    act(() => focusedRow.focus());
    expect(focusedRow).toHaveAttribute('data-focused');

    const options: UseEpisodeDurationsSectionOptions = { animeId: 'anime-1', folder: 'D:/Anime/Oshi no Ko', totalEpisodes: '12', kind: '0' };
    rerender(<Harness options={options} source={fake.source} />);

    expect(screen.getAllByTestId('episode-durations-skeleton-row')).toHaveLength(EPISODE_DURATIONS_SKELETON_ROW_COUNT);
    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3));
    expect(screen.queryAllByTestId('episode-durations-skeleton-row')).toHaveLength(0);
  });

  it('shows the failure alert alone: no table, no skeleton, no mascot', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section({ outcome: 'error', message: 'disk gone' }))));
    expand();

    expect(await screen.findByText('Episode durations could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('disk gone')).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.queryByRole('status', { name: EPISODE_DURATIONS_LOADING_LABEL })).toBeNull();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the inline empty state with Add episode, no table, and Re-analyze disabled without a folder', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section({ folderStatus: 'none', rows: [] })));
    renderSection(fake, { folder: '', totalEpisodes: '' });
    expand();

    expect(await screen.findByRole('heading', { level: 3, name: 'No episode durations yet' })).toBeInTheDocument();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('button', { name: 'Re-analyze folder (Set a folder first)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add episode' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('For an episode whose file is not here yet.');
  });

  it('keeps saved durations and explains a missing folder', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section({ folderStatus: 'missing' }))));
    expand();

    expect(await screen.findByText('Showing saved durations')).toBeInTheDocument();
    expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Re-analyze folder (Folder not found)' })).toBeDisabled();
  });

  it('names the row Edit button in its tooltip on hover', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section())));
    expand();
    const edit = await screen.findByRole('button', { name: 'Edit episode 3 duration' });

    // The table's grid keeps focus on the row, so the tooltip is proven by mouse hover;
    // the pointer press first leaves keyboard modality, in which a tooltip ignores hover.
    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    fireEvent.pointerUp(document.body, { pointerType: 'mouse' });
    fireEvent.pointerOver(edit.parentElement as HTMLElement, { pointerType: 'mouse' });

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit duration');
  });
});

describe('EpisodeDurationsSection progressive table', () => {
  it('renders one batch of a long series, not every episode, and grows near the bottom', async () => {
    const rows = Array.from({ length: 150 }, (_unused, index) => row(index + 1, 24));
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section({ rows }))), { totalEpisodes: '150' });
    expand();

    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(20));
    expect(screen.queryByRole('button', { name: 'Add episode' })).toBeNull();
    fireEvent.scroll(screen.getByTestId('episode-durations-scroll'));

    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(40));
  });

  it('renders one batch of a long review, not every file', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    renderSection(fake);
    expand();
    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3));
    expect(screen.getByRole('button', { name: 'Re-analyze folder' })).toHaveTextContent(/^$/);
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze folder' }));
    const rows = Array.from({ length: 150 }, (_unused, index) => ({
      episode: index + 1, basename: `e${index + 1}.mkv`, currentMs: 0, currentMinutes: 0, currentSource: '', measuredMs: 1_440_000, measuredMinutes: 24, result: 'add' as const,
    }));

    await act(async () => fake.settleReview({ outcome: 'ok', status: 'ok', filesRecognized: 150, rows }));

    expect(await screen.findAllByTestId('episode-review-row')).toHaveLength(20);
    fireEvent.scroll(screen.getByTestId('episode-review-scroll'));
    await waitFor(() => expect(screen.getAllByTestId('episode-review-row')).toHaveLength(40));
  });
});

describe('EpisodeDurationsSection own draft', () => {
  it('keeps a hand edit in the card draft, marks the row Unsaved and counts it in the footer', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    renderSection(fake);
    expand();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit episode 3 duration' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Episode 03 duration')).toBeInTheDocument();
    expect(within(dialog).getByText('Measured from the file')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '46' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

    const edited = screen.getAllByTestId('episode-durations-row')[2] as HTMLElement;
    expect(within(edited).getByText('Unsaved')).toBeInTheDocument();
    expect(within(edited).getByText('Long')).toBeInTheDocument();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(fake.source.saveEpisodeDurations).not.toHaveBeenCalled();
  });

  it('saves the card edits through their own binding, clears the draft and reads the rows again', async () => {
    const getSection = vi.fn().mockResolvedValue(section());
    const fake = createFakeSource(getSection);
    renderSection(fake);
    expand();
    await editEpisodeThree('46');
    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Save episodes' }));

    await waitFor(() => expect(getSection).toHaveBeenCalledTimes(2));
    expect(fake.source.saveEpisodeDurations).toHaveBeenCalledWith('anime-1', [{ episode: 3, durationMs: 46 * 60_000, source: 'manual', clear: false }]);
    expect(screen.queryByText('Unsaved')).toBeNull();
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save episodes' })).toBeDisabled();
    expect(screen.queryByText('Episode durations were not saved.')).toBeNull();
  });

  it('keeps the draft and shows the save failure in the card', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()), vi.fn().mockResolvedValue({ outcome: 'error', message: 'disk full', changed: 0 }));
    renderSection(fake);
    expand();
    await editEpisodeThree('46');

    fireEvent.click(screen.getByRole('button', { name: 'Save episodes' }));

    expect(await screen.findByText('Episode durations were not saved.')).toBeInTheDocument();
    expect(screen.getByText('disk full')).toBeInTheDocument();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('keeps the draft and its footer when the table is hidden, and Discard changes drops it', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section())));
    expand();
    await editEpisodeThree('46');

    fireEvent.click(screen.getByRole('button', { name: 'Hide episodes' }));
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    expand();
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByText('Unsaved')).toBeNull();
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });

  it('runs a re-analysis with progress and Cancel, locks row edits and Save, then confirms the review into the card draft', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    renderSection(fake);
    expand();
    await editEpisodeThree('30');
    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze folder' }));
    act(() => fake.emitProgress({ animeId: 'anime-1', index: 2, total: 3, episode: 2 }));
    expect(screen.getByText('Measuring episode 2 · 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit episode 1 duration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Re-analyze folder (Analyzing…)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save episodes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fake.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
    await act(async () => fake.settleReview({
      outcome: 'ok', status: 'ok', filesRecognized: 3,
      rows: [{ episode: 2, basename: 'e02.mkv', currentMs: 24 * 60_000, currentMinutes: 24, currentSource: 'measured', measuredMs: 46 * 60_000, measuredMinutes: 46, result: 'update' }],
    }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Folder found · 3 episode files recognized')).toBeInTheDocument();
    expect(within(dialog).getByText('Will update')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm 1 change' }));

    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit episode 1 duration' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save episodes' })).toBeEnabled();
    expect(fake.source.saveEpisodeDurations).not.toHaveBeenCalled();
  });

  it('shows the analysis progress even while the table is hidden', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    renderSection(fake);
    await screen.findByText('3 of 3 measured');

    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze folder' }));
    act(() => fake.emitProgress({ animeId: 'anime-1', index: 1, total: 3, episode: 1 }));

    expect(screen.getByText('Measuring episode 1 · 1 of 3')).toBeInTheDocument();
    expect(screen.queryAllByTestId('episode-durations-row')).toHaveLength(0);
  });
});

describe('useEpisodeDurationsSection', () => {
  it('lists no review rows and no progress before a re-analysis, and starts clean and collapsed', () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    const options: UseEpisodeDurationsSectionOptions = { animeId: 'anime-1', folder: 'D:/x', totalEpisodes: '12', kind: '0' };
    const { result } = renderHook(() => useEpisodeDurationsSection(options, fake.source));

    expect(result.current.visibleReviewRows).toEqual([]);
    expect(result.current.progress).toBeUndefined();
    expect(result.current.isDirty).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });
});
