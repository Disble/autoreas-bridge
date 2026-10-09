import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RateAnimeModalProps } from '../../RateAnimeModal/rate-anime-modal.types';
import { EvaluationPanel } from '../EvaluationPanel';
import type { SeasonSectionId } from '../../SeasonWorkspace/season-workspace.types';
import { toEvaluationListItems } from '../evaluation-panel.helpers';
import type { EvaluationRow } from '../evaluation-panel.types';
import { useEvaluationPanel } from '../use-evaluation-panel';

vi.mock('../use-evaluation-panel', () => ({ useEvaluationPanel: vi.fn() }));
vi.mock('../../RateAnimeModal/RateAnimeModal', () => ({
  /** Stands in for the shared modal, exposing the props the row hands it. */
  RateAnimeModal: (props: RateAnimeModalProps) => (
    <div
      data-anime={props.animeId}
      data-grade={props.currentGrade}
      data-name={props.rawName}
      data-source={props.gradeSource}
      data-testid="rate-modal"
      data-variant={props.triggerVariant}
    />
  ),
}));

/** The hook double every case configures. */
const mockedUseEvaluationPanel = vi.mocked(useEvaluationPanel);
/** What the panel's hook returns. */
type HookReturn = ReturnType<typeof useEvaluationPanel>;

/** Builds an ungraded Evaluation row with the given overrides. */
function evalRow(overrides: Partial<EvaluationRow> = {}): EvaluationRow {
  return { id: 'e', animeId: 'a', rawName: 'Anime A', grade: 0, gradeSource: '', skipGrading: false, ...overrides };
}

/** Configures the hook double with the given rows and overrides, and returns its value. */
function mockHook(rows: readonly EvaluationRow[] = [], overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    readOnly: false,
    items: toEvaluationListItems(rows),
    ungradedCount: 0,
    errorMessage: undefined,
    onSkip: vi.fn(),
    getCoverThumb: () => ({ coverSrc: undefined, isLoading: false }),
    ...overrides,
  };
  mockedUseEvaluationPanel.mockReturnValue(value);
  return value;
}

/** Returns the list row that shows the given anime name. */
function getRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (row === null) {
    throw new Error(`no row for ${name}`);
  }
  return row;
}

describe('EvaluationPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state and no list when there are no candidates', () => {
    mockHook();
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(screen.getByText('No candidates to evaluate yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('offers navigation to Intake from the empty state', () => {
    const onNavigate = vi.fn<(section: SeasonSectionId) => void>();
    mockHook();
    render(<EvaluationPanel onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to Intake' }));
    expect(onNavigate).toHaveBeenCalledWith('intake');
  });

  it('gives an ungraded row its meta, chip, a rate button and a skip button', () => {
    const onSkip = vi.fn();
    mockHook([evalRow({ id: 'row-1', animeId: 'anime-1' })], { onSkip });
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    const row = within(getRow('Anime A'));

    expect(row.getByText('Not rated yet')).toBeInTheDocument();
    expect(row.getByText('No grade')).toBeInTheDocument();
    const modal = row.getByTestId('rate-modal');
    expect(modal).toHaveAttribute('data-variant', 'rate');
    expect(modal).toHaveAttribute('data-anime', 'anime-1');
    expect(modal).toHaveAttribute('data-name', 'Anime A');
    expect(modal).toHaveAttribute('data-grade', '0');

    const skip = row.getByRole('button', { name: 'Skip' });
    expect(skip.className).toContain('button--ghost');
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledWith('row-1');
  });

  it.each([
    { name: 'a graded row', row: evalRow({ grade: 5, gradeSource: 'manual', ratedAt: 1_751_500_000_000 }), chip: 'Grade 5' },
    { name: 'a skipped row', row: evalRow({ skipGrading: true }), chip: 'Skipped' },
  ])('gives $name its chip and the change-grade trigger, without a skip button', ({ row, chip }) => {
    mockHook([row]);
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    const listRow = within(getRow('Anime A'));

    expect(listRow.getByText(chip)).toBeInTheDocument();
    const modal = listRow.getByTestId('rate-modal');
    expect(modal).toHaveAttribute('data-variant', 'icon');
    expect(modal).toHaveAttribute('data-grade', String(row.grade));
    expect(modal).toHaveAttribute('data-source', row.gradeSource);
    expect(listRow.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(listRow.queryByText('Not rated yet')).not.toBeInTheDocument();
  });

  it('shows the source and date of a graded row', () => {
    mockHook([evalRow({ grade: 4, gradeSource: 'mobile_sync', ratedAt: 1_751_500_000_000 })]);
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(within(getRow('Anime A')).getByText(/^Mobile · /)).toBeInTheDocument();
  });

  it('hides every rate and skip action on a read-only season, keeping the chips', () => {
    mockHook([evalRow({ id: 'p', rawName: 'Pending' }), evalRow({ id: 'g', rawName: 'Graded', grade: 3 })], { readOnly: true });
    render(<EvaluationPanel onNavigate={vi.fn()} />);

    expect(screen.queryByTestId('rate-modal')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
    expect(within(getRow('Pending')).getByText('No grade')).toBeInTheDocument();
    expect(within(getRow('Graded')).getByText('Grade 3')).toBeInTheDocument();
  });

  it('renders the rows in the order the hook hands them', () => {
    mockHook([evalRow({ id: 'g', rawName: 'Graded', grade: 3 }), evalRow({ id: 'p', rawName: 'Pending' })]);
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Pending'),
      expect.stringContaining('Graded'),
    ]);
  });

  it('renders each row cover from its anime id', () => {
    mockHook([evalRow({ animeId: 'anime-1' })], {
      getCoverThumb: (animeId) => ({ coverSrc: `data:${animeId}`, isLoading: false }),
    });
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(screen.getByTestId('season-cover-thumb-image')).toHaveAttribute('src', 'data:anime-1');
  });

  it.each([
    { ungradedCount: 1, shown: true },
    { ungradedCount: 0, shown: false },
  ])('shows the ungraded warning only when candidates are ungraded ($ungradedCount)', ({ ungradedCount, shown }) => {
    mockHook([evalRow()], { ungradedCount });
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(screen.queryByText(/1 ungraded/) !== null).toBe(shown);
    expect(screen.queryByText(/derive as not approved at selection/) !== null).toBe(shown);
  });

  it.each([
    { errorMessage: 'Grading failed', shown: true },
    { errorMessage: undefined, shown: false },
  ])('shows the error alert only when there is an error ($errorMessage)', ({ errorMessage, shown }) => {
    mockHook([], { errorMessage });
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(screen.queryByText('Grading failed') !== null).toBe(shown);
    expect(screen.queryByText('No candidates to evaluate yet') !== null).toBe(!shown);
    expect(screen.queryByRole('list', { name: 'Candidates' })).not.toBeInTheDocument();
  });

  it('keeps populated candidates visible and suppresses the empty state when grading errors', () => {
    mockHook([evalRow()], { errorMessage: 'Grading failed' });
    render(<EvaluationPanel onNavigate={vi.fn()} />);
    expect(screen.getByText('Anime A')).toBeInTheDocument();
    expect(screen.queryByText('No candidates to evaluate yet')).not.toBeInTheDocument();
  });
});
