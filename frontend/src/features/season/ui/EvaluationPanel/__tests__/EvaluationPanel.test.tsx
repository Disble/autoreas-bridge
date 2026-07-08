import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EvaluationPanel } from '../EvaluationPanel';
import type { EvaluationRow } from '../evaluation-panel.types';
import { useEvaluationPanel } from '../use-evaluation-panel';

vi.mock('../use-evaluation-panel', () => ({ useEvaluationPanel: vi.fn() }));
vi.mock('../../RateAnimeModal/RateAnimeModal', () => ({ RateAnimeModal: () => <div data-testid="rate-modal" /> }));

const mockedUseEvaluationPanel = vi.mocked(useEvaluationPanel);
type HookReturn = ReturnType<typeof useEvaluationPanel>;

function evalRow(overrides: Partial<EvaluationRow> = {}): EvaluationRow {
  return { id: 'e', animeId: 'a', rawName: 'Anime A', grade: 0, gradeSource: '', skipGrading: false, ...overrides };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    readOnly: false,
    rows: [],
    ungradedCount: 0,
    errorMessage: undefined,
    onSkip: vi.fn(),
    ...overrides,
  };
  mockedUseEvaluationPanel.mockReturnValue(value);
  return value;
}

describe('EvaluationPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no candidates', () => {
    mockHook();
    render(<EvaluationPanel />);
    expect(screen.getByText(/No created candidates yet/)).toBeInTheDocument();
  });

  it('renders a graded candidate with its grade and a rate trigger', () => {
    mockHook({ rows: [evalRow({ grade: 5, gradeSource: 'manual' })] });
    render(<EvaluationPanel />);
    expect(screen.getByText('Anime A')).toBeInTheDocument();
    expect(screen.getByText('Grade 5')).toBeInTheDocument();
    expect(screen.getByTestId('rate-modal')).toBeInTheDocument();
  });

  it('flags an ungraded candidate and shows the ungraded banner', () => {
    mockHook({ rows: [evalRow({ grade: 0 })], ungradedCount: 1 });
    render(<EvaluationPanel />);
    expect(screen.getByText('No grade')).toBeInTheDocument();
    expect(screen.getByText(/1 ungraded/)).toBeInTheDocument();
  });

  it('skips grading for a row', () => {
    const onSkip = vi.fn();
    mockHook({ rows: [evalRow({ id: 'row-1' })], onSkip });
    render(<EvaluationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalledWith('row-1');
  });
});
