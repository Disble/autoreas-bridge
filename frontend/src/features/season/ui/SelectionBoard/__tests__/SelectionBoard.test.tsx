import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectionBoard } from '../SelectionBoard';
import { groupSelectionRows } from '../selection-board.helpers';
import type { SelectionRow } from '../selection-board.types';
import { useSelectionBoard } from '../use-selection-board';

vi.mock('../use-selection-board', () => ({ useSelectionBoard: vi.fn() }));

/** The mocked hook every case drives the board through. */
const mockedUseSelectionBoard = vi.mocked(useSelectionBoard);

/** What the board's hook returns. */
type HookReturn = ReturnType<typeof useSelectionBoard>;

/** Builds one selection row, overriding only what a case sets. */
function selRow(overrides: Partial<SelectionRow> = {}): SelectionRow {
  return {
    id: 'r', animeId: 'a', rawName: 'Anime A', grade: 5, consideration: 'none', verdict: 'approved',
    folderPath: '', pageUrl: '', hasFolder: false, hasPage: false,
    ...overrides,
  };
}

/** A candidate with both a source page and a download folder. */
const DR_STONE = selRow({
  id: 'r-1', animeId: 'anime-1', rawName: 'Dr. Stone', hasPage: true, hasFolder: true,
  pageUrl: 'https://jkanime.net/dr-stone/', folderPath: 'D:/downloads/dr-stone',
});

/** Two approved candidates and one rejected one, already approved-first. */
const MIXED_ROWS = [
  selRow({ id: 'r-a1', animeId: 'anime-a1', rawName: 'Sayonara Lara', grade: 6 }),
  selRow({ id: 'r-a2', animeId: 'anime-a2', rawName: 'Yani Neko', grade: 1, consideration: 'spare_quota' }),
  selRow({ id: 'r-r1', animeId: 'anime-r1', rawName: 'Black Torch', grade: 0, verdict: 'rejected' }),
];

/** Makes the hook return a board, grouping `rows` the way the real hook does. */
function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const rows = overrides.rows ?? [];
  const value: HookReturn = {
    readOnly: false,
    seasonName: 'Julio 2026',
    minApprovalGrade: 4,
    slots: 12,
    rows,
    groups: groupSelectionRows(rows),
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
    getCoverThumb: (animeId: string) => ({ coverSrc: `data:${animeId}`, isLoading: false }),
    ...overrides,
  };
  mockedUseSelectionBoard.mockReturnValue(value);
  return value;
}

/** The four rules steppers, by accessible name. */
const STEPPERS = ['Decrease minimum approval grade', 'Increase minimum approval grade', 'Decrease slots', 'Increase slots'];

/** Whether each rules stepper is disabled, in `STEPPERS` order. */
function stepperDisabledStates(): boolean[] {
  return STEPPERS.map((name) => screen.getByRole('button', { name }).hasAttribute('disabled'));
}

/** Opens the confirm modal and returns its dialog. */
async function openConfirmDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm selection' }));
  return screen.findByRole('dialog');
}

describe('SelectionBoard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state, no candidate group, and a disabled confirm when there are no candidates', () => {
    mockHook();
    render(<SelectionBoard />);
    expect(screen.getByText(/No created candidates yet/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeDisabled();
  });

  it('shows the store error only when there is one', () => {
    mockHook({ errorMessage: 'season load failed' });
    render(<SelectionBoard />);
    expect(screen.getByText('season load failed')).toBeInTheDocument();
    cleanup();

    mockHook();
    render(<SelectionBoard />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the decision header with grade, slots and quota', () => {
    mockHook({ approvedCount: 9, rows: [selRow()] });
    render(<SelectionBoard />);
    expect(screen.getByText('9 / 12 approved')).toBeInTheDocument();
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

  it.each([
    ['Decrease minimum approval grade', 'onSetMinApprovalGrade', 3],
    ['Increase minimum approval grade', 'onSetMinApprovalGrade', 5],
    ['Decrease slots', 'onSetSlots', 11],
    ['Increase slots', 'onSetSlots', 13],
  ] as const)('%s steps its rule by one', (name, handler, next) => {
    const hook = mockHook({ rows: [selRow()] });
    render(<SelectionBoard />);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(hook[handler]).toHaveBeenCalledWith(next);
  });

  it.each([
    ['the lowest grade', 1, 12, [true, false, false, false]],
    ['one above the lowest grade', 2, 12, [false, false, false, false]],
    ['the highest grade', 6, 12, [false, true, false, false]],
    ['one below the highest grade', 5, 12, [false, false, false, false]],
    ['a single slot', 4, 1, [false, false, true, false]],
    ['two slots', 4, 2, [false, false, false, false]],
  ])('disables only the steppers that would leave the range at %s', (_case, minApprovalGrade, slots, disabled) => {
    mockHook({ rows: [selRow()], minApprovalGrade, slots });
    render(<SelectionBoard />);
    expect(stepperDisabledStates()).toEqual(disabled);
  });

  it('locks every stepper and hides confirm on a read-only season', () => {
    mockHook({ rows: [selRow()], readOnly: true });
    render(<SelectionBoard />);
    expect(stepperDisabledStates()).toEqual([true, true, true, true]);
    expect(screen.queryByRole('button', { name: 'Confirm selection' })).not.toBeInTheDocument();
  });

  it('confirms through the modal, summarizing approved and rejected counts', async () => {
    const hook = mockHook({ rows: MIXED_ROWS, approvedCount: 2, quota: 'under' });
    render(<SelectionBoard />);
    const dialog = await openConfirmDialog();
    expect(within(dialog).getByText(/^2 approved · 1 rejected\./)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Over quota/)).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply reconciliation' }));
    expect(hook.onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each(['under', 'at'] as const)('keeps the over-quota warning out of the modal when the quota is %s', async (quota) => {
    mockHook({ rows: MIXED_ROWS, approvedCount: 2, slots: 2, quota });
    render(<SelectionBoard />);
    const dialog = await openConfirmDialog();
    expect(within(dialog).queryByText(/Over quota/)).not.toBeInTheDocument();
  });

  it('warns in the modal when the approved count is over quota', async () => {
    mockHook({ rows: MIXED_ROWS, approvedCount: 2, slots: 1, quota: 'over' });
    render(<SelectionBoard />);
    const dialog = await openConfirmDialog();
    expect(within(dialog).getByText(/Over quota \(2 \/ 1\)/)).toBeInTheDocument();
  });

  it('groups the candidates under Approved and Rejected with their counts, each in row order', () => {
    mockHook({ rows: MIXED_ROWS, approvedCount: 2 });
    render(<SelectionBoard />);
    const approved = screen.getByRole('list', { name: 'Approved · 2' });
    const rejected = screen.getByRole('list', { name: 'Rejected · 1' });
    expect(within(approved).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Sayonara Lara'),
      expect.stringContaining('Yani Neko'),
    ]);
    expect(within(rejected).getAllByRole('listitem')).toHaveLength(1);
    expect(within(rejected).getByText('Black Torch')).toBeInTheDocument();
  });

  it('shows each candidate cover and grade, with a dash for an ungraded one', () => {
    mockHook({ rows: MIXED_ROWS, approvedCount: 2 });
    render(<SelectionBoard />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('img')?.getAttribute('src'))).toEqual(['data:anime-a1', 'data:anime-a2', 'data:anime-r1']);
    expect(items.map((item) => within(item).getByTestId('selection-grade').textContent)).toEqual(['6', '1', '—']);
  });

  it('edits a candidate consideration through its select', () => {
    const hook = mockHook({ rows: [DR_STONE], approvedCount: 1 });
    render(<SelectionBoard />);
    fireEvent.click(screen.getByRole('button', { name: /Consideration for Dr\. Stone/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Spare quota' }));
    expect(hook.onSetConsideration).toHaveBeenCalledWith('r-1', 'spare_quota');
  });

  it('shows the consideration as plain text, without a select, on a read-only season', () => {
    mockHook({ rows: [selRow({ rawName: 'Dr. Stone', consideration: 'insufficient_quota' })], readOnly: true });
    render(<SelectionBoard />);
    expect(screen.getByText('Insufficient quota')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Consideration for/ })).not.toBeInTheDocument();
  });

  it.each([false, true])('opens the page and folder through the desktop actions (read-only: %s)', (readOnly) => {
    const hook = mockHook({ rows: [DR_STONE], approvedCount: 1, readOnly });
    render(<SelectionBoard />);
    fireEvent.click(screen.getByRole('button', { name: /open page/i }));
    expect(hook.onOpenPage).toHaveBeenCalledWith('anime-1');
    fireEvent.click(screen.getByRole('button', { name: /open folder/i }));
    expect(hook.onOpenFolder).toHaveBeenCalledWith('anime-1');
  });

  it('hides the desktop actions for a candidate without a page or folder', () => {
    mockHook({ rows: [selRow({ rawName: 'No Path Anime', hasPage: false, hasFolder: false })], approvedCount: 1 });
    render(<SelectionBoard />);
    expect(screen.queryByRole('button', { name: /open page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open folder/i })).not.toBeInTheDocument();
  });
});
