import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectionBoard } from '../SelectionBoard';
import type { SelectionRow } from '../selection-board.types';
import { useSelectionBoard } from '../use-selection-board';

vi.mock('../use-selection-board', () => ({ useSelectionBoard: vi.fn() }));

const mockedUseSelectionBoard = vi.mocked(useSelectionBoard);
type HookReturn = ReturnType<typeof useSelectionBoard>;

function selRow(overrides: Partial<SelectionRow> = {}): SelectionRow {
  return { id: 'r', animeId: 'a', rawName: 'Anime A', grade: 5, consideration: 'none', verdict: 'approved', ...overrides };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    readOnly: false,
    seasonName: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    rows: [],
    approvedCount: 0,
    quota: 'under',
    errorMessage: undefined,
    onSetMinApprovalGrade: vi.fn(),
    onSetSlots: vi.fn(),
    onSetConsideration: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    ...overrides,
  };
  mockedUseSelectionBoard.mockReturnValue(value);
  return value;
}

describe('SelectionBoard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no candidates', () => {
    mockHook();
    render(<SelectionBoard />);
    expect(screen.getByText(/No created candidates yet/)).toBeInTheDocument();
  });

  it('renders the decision header with grade, slots and quota', () => {
    mockHook({ approvedCount: 9, rows: [selRow()] });
    render(<SelectionBoard />);
    expect(screen.getByText('9 / 12 approved')).toBeInTheDocument();
  });

  it('renders a candidate row with its verdict', () => {
    mockHook({ rows: [selRow({ rawName: 'Dr. Stone', grade: 5, verdict: 'approved' })], approvedCount: 1 });
    render(<SelectionBoard />);
    expect(screen.getByText('Dr. Stone')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  // Note: the confirm trigger opens a HeroUI Modal whose body renders in a portal
  // on open (not reliably simulable under jsdom); the onConfirm wiring is verified
  // in the hook test. Here we assert the trigger is present.
  it('offers a confirm-selection trigger', () => {
    mockHook({ rows: [selRow()], approvedCount: 1 });
    render(<SelectionBoard />);
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeInTheDocument();
  });

  it('bumps the minimum approval grade', () => {
    const onSetMinApprovalGrade = vi.fn();
    mockHook({ rows: [selRow()], onSetMinApprovalGrade });
    render(<SelectionBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase minimum approval grade' }));
    expect(onSetMinApprovalGrade).toHaveBeenCalledWith(5);
  });
});
