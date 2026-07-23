import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectionBoard } from '../SelectionBoard';
import type { SelectionRow } from '../selection-board.types';
import { useSelectionBoard } from '../use-selection-board';

vi.mock('../use-selection-board', () => ({ useSelectionBoard: vi.fn() }));

const mockedUseSelectionBoard = vi.mocked(useSelectionBoard);
type HookReturn = ReturnType<typeof useSelectionBoard>;

function selRow(overrides: Partial<SelectionRow> = {}): SelectionRow {
  return {
    id: 'r', animeId: 'a', rawName: 'Anime A', grade: 5, consideration: 'none', verdict: 'approved',
    folderPath: '', pageUrl: '', hasFolder: false, hasPage: false,
    ...overrides,
  };
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
    selectionConfirmedAt: undefined,
    errorMessage: undefined,
    onSetMinApprovalGrade: vi.fn(),
    onSetSlots: vi.fn(),
    onSetConsideration: vi.fn(),
    onConfirm: vi.fn().mockResolvedValue({ status: 'ok', approved: 0, rejected: 0, quotaExceeded: false }),
    onOpenPage: vi.fn(),
    onCopyPage: vi.fn(),
    onOpenFolder: vi.fn(),
    onCopyFolder: vi.fn(),
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

  it('shows "Not confirmed yet" when the selection was never confirmed', () => {
    mockHook({ rows: [selRow()], approvedCount: 1, selectionConfirmedAt: undefined });
    render(<SelectionBoard />);
    expect(screen.getByText('Not confirmed yet')).toBeInTheDocument();
  });

  it('shows the persistent confirmed-at label when the milestone exists', () => {
    const ms = 1_753_000_000_000;
    mockHook({ rows: [selRow()], approvedCount: 1, selectionConfirmedAt: ms });
    render(<SelectionBoard />);
    expect(screen.getByText(`Confirmed ${new Date(ms).toLocaleString()}`)).toBeInTheDocument();
  });

  it('bumps the minimum approval grade', () => {
    const onSetMinApprovalGrade = vi.fn();
    mockHook({ rows: [selRow()], onSetMinApprovalGrade });
    render(<SelectionBoard />);
    fireEvent.click(screen.getByRole('button', { name: 'Increase minimum approval grade' }));
    expect(onSetMinApprovalGrade).toHaveBeenCalledWith(5);
  });

  it('renders the desktop actions for a candidate with a page and a folder', () => {
    mockHook({
      rows: [selRow({ animeId: 'anime-1', rawName: 'Dr. Stone', hasPage: true, hasFolder: true, pageUrl: 'https://jkanime.net/dr-stone/', folderPath: 'D:/downloads/dr-stone' })],
      approvedCount: 1,
    });
    render(<SelectionBoard />);
    expect(screen.getByRole('button', { name: /open page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open folder/i })).toBeInTheDocument();
  });

  it('opens the page and folder through the desktop-action callbacks', () => {
    const onOpenPage = vi.fn();
    const onOpenFolder = vi.fn();
    mockHook({
      rows: [selRow({ animeId: 'anime-1', rawName: 'Dr. Stone', hasPage: true, hasFolder: true, pageUrl: 'https://jkanime.net/dr-stone/', folderPath: 'D:/downloads/dr-stone' })],
      approvedCount: 1,
      onOpenPage,
      onOpenFolder,
    });
    render(<SelectionBoard />);
    fireEvent.click(screen.getByRole('button', { name: /open page/i }));
    expect(onOpenPage).toHaveBeenCalledWith('anime-1');
    fireEvent.click(screen.getByRole('button', { name: /open folder/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('anime-1');
  });

  it('hides the desktop actions for a candidate without a page or folder', () => {
    mockHook({ rows: [selRow({ rawName: 'No Path Anime', hasPage: false, hasFolder: false })], approvedCount: 1 });
    render(<SelectionBoard />);
    expect(screen.queryByRole('button', { name: /open page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open folder/i })).not.toBeInTheDocument();
  });
});
