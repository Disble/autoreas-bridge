import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EpisodeDurationRow,
  EpisodeDurationRuntimeSource,
  EpisodeDurationSection,
  EpisodeReanalysisProgress,
  EpisodeReanalysisReview,
} from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
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
 * Builds a source whose section read uses `getSection` and whose re-analysis
 * stays pending until the test settles it.
 * @param getSection The section binding.
 * @returns The fake source.
 */
function createFakeSource(getSection: EpisodeDurationRuntimeSource['getEpisodeDurationSection']): FakeSource {
  let listener: (progress: EpisodeReanalysisProgress) => void = () => undefined;
  let settle: (review: EpisodeReanalysisReview) => void = () => undefined;
  return {
    source: {
      getEpisodeDurationSection: getSection,
      reanalyzeEpisodeDurations: vi.fn(() => new Promise<EpisodeReanalysisReview>((resolve) => { settle = resolve; })),
      cancelEpisodeReanalysis: vi.fn().mockResolvedValue(undefined),
      onEpisodeReanalysisProgress: vi.fn((next: (progress: EpisodeReanalysisProgress) => void) => { listener = next; return () => undefined; }),
    },
    emitProgress: (progress) => listener(progress),
    settleReview: (review) => settle(review),
  };
}

/** Props of the test harness: the draft inputs and the fake source. */
interface HarnessProps {
  readonly options: UseEpisodeDurationsSectionOptions;
  readonly source: EpisodeDurationRuntimeSource;
}

/**
 * Renders the real section hook into the real component.
 * @param props The draft inputs and the source.
 * @returns The section.
 */
function Harness({ options, source }: Readonly<HarnessProps>) {
  const viewModel = useEpisodeDurationsSection(options, source);
  return <EpisodeDurationsSection viewModel={viewModel} />;
}

/**
 * Renders the section for one draft.
 * @param fake The fake source.
 * @param overrides Draft fields to replace.
 * @returns The render result and the edits spy.
 */
function renderSection(fake: FakeSource, overrides: Partial<UseEpisodeDurationsSectionOptions> = {}) {
  const onEditsChange = vi.fn();
  const options: UseEpisodeDurationsSectionOptions = {
    animeId: 'anime-1', folder: 'D:/Anime/Oshi no Ko', totalEpisodes: '12', kind: '0', edits: [], revision: 0, onEditsChange, ...overrides,
  };
  const view = render(<Harness options={options} source={fake.source} />);
  return { ...view, onEditsChange, options };
}

/** Opens the Episodes disclosure. */
function expand(): void {
  fireEvent.click(screen.getByRole('button', { name: /^Episodes/ }));
}

describe('EpisodeDurationsSection trigger', () => {
  it('summarizes measured and long episodes on the closed trigger', async () => {
    renderSection(createFakeSource(vi.fn().mockResolvedValue(section())));

    const trigger = await screen.findByRole('button', { name: /^Episodes/ });
    await waitFor(() => expect(within(trigger).getByText('3 of 3 measured')).toBeInTheDocument());
    expect(within(trigger).getByText('1 long')).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders nothing while no record is loaded', () => {
    renderSection(createFakeSource(vi.fn()), { animeId: undefined });

    expect(screen.queryByRole('button', { name: /^Episodes/ })).toBeNull();
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

describe('EpisodeDurationsSection edits', () => {
  it('applies a hand edit into the draft and marks the row Unsaved', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    const { onEditsChange, rerender, options } = renderSection(fake);
    expand();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit episode 3 duration' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Episode 03 duration')).toBeInTheDocument();
    expect(within(dialog).getByText('Measured from the file')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Minutes'), { target: { value: '46' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

    const edits: readonly EpisodeDurationEdit[] = [{ episode: 3, durationMs: 46 * 60_000, source: 'manual', clear: false }];
    expect(onEditsChange).toHaveBeenCalledWith(edits);
    rerender(<Harness options={{ ...options, edits }} source={fake.source} />);
    const edited = screen.getAllByTestId('episode-durations-row')[2];
    expect(edited).toBeDefined();
    expect(within(edited as HTMLElement).getByText('Unsaved')).toBeInTheDocument();
    expect(within(edited as HTMLElement).getByText('Long')).toBeInTheDocument();
  });

  it('runs a re-analysis with progress and Cancel, locks row edits, then confirms the review into the draft', async () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    const { onEditsChange } = renderSection(fake);
    expand();
    await waitFor(() => expect(screen.getAllByTestId('episode-durations-row')).toHaveLength(3));

    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze folder' }));
    act(() => fake.emitProgress({ animeId: 'anime-1', index: 2, total: 3, episode: 2 }));
    expect(screen.getByText('Measuring episode 2 · 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit episode 1 duration' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Re-analyze folder (Analyzing…)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(fake.source.cancelEpisodeReanalysis).toHaveBeenCalledTimes(1);
    await act(async () => fake.settleReview({
      outcome: 'ok', status: 'ok', filesRecognized: 3,
      rows: [{ episode: 3, basename: 'e03.mkv', currentMs: 23 * 60_000, currentMinutes: 23, currentSource: 'measured', measuredMs: 46 * 60_000, measuredMinutes: 46, result: 'update' }],
    }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Folder found · 3 episode files recognized')).toBeInTheDocument();
    expect(within(dialog).getByText('Will update')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm 1 change' }));

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 3, durationMs: 46 * 60_000, source: 'measured', clear: false }]);
    expect(screen.getByRole('button', { name: 'Edit episode 1 duration' })).toBeEnabled();
  });
});

describe('useEpisodeDurationsSection', () => {
  it('lists no review rows and no progress before a re-analysis', () => {
    const fake = createFakeSource(vi.fn().mockResolvedValue(section()));
    const options: UseEpisodeDurationsSectionOptions = { animeId: 'anime-1', folder: 'D:/x', totalEpisodes: '12', kind: '0', edits: [], revision: 0, onEditsChange: vi.fn() };
    const { result } = renderHook(() => useEpisodeDurationsSection(options, fake.source));

    expect(result.current.visibleReviewRows).toEqual([]);
    expect(result.current.progress).toBeUndefined();
  });
});
