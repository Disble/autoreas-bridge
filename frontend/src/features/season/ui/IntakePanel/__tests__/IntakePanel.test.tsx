import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';

vi.mock('../use-intake-panel', () => ({
  useIntakePanel: vi.fn(),
}));

const mockedUseIntakePanel = vi.mocked(useIntakePanel);
type HookReturn = ReturnType<typeof useIntakePanel>;

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Dr. Stone',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting', availableChapters: 0,
    animeId: '',
    section: '',
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',    ...overrides,
  };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    mode: 'list',
    switchMode: vi.fn(),
    rawDraft: '',
    onRawChange: vi.fn(),
    editableRows: [],
    selected: new Set<string>(),
    toggleSelect: vi.fn(),
    availableCount: 0,
    onCreate: vi.fn(),
    unresolvedCount: 0,
    errorMessage: undefined,
    onRunMatching: vi.fn(),
    onResolve: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
  mockedUseIntakePanel.mockReturnValue(value);
  return value;
}

describe('IntakePanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders editable rows with status chips in list mode', () => {
    mockHook({ editableRows: [row({ matchStatus: 'ambiguous' })], unresolvedCount: 1 });
    render(<IntakePanel />);
    expect(screen.getByText('Dr. Stone')).toBeInTheDocument();
    expect(screen.getByText('Ambiguous')).toBeInTheDocument();
    expect(screen.getByText(/1 unresolved/)).toBeInTheDocument();
  });

  it('shows the raw textarea in raw mode', () => {
    mockHook({ mode: 'raw', rawDraft: 'Anime A\nAnime B' });
    render(<IntakePanel />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
    expect((textarea as HTMLTextAreaElement).value).toBe('Anime A\nAnime B');
  });

  it('the mode toggle switches to raw', () => {
    const switchMode = vi.fn();
    mockHook({ switchMode });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(switchMode).toHaveBeenCalledWith('raw');
  });

  it('shows an available row with its chapter count and a create checkbox', () => {
    mockHook({
      editableRows: [row({ matchStatus: 'matched', matchedSlug: 'https://jkanime.net/x/', availability: 'available', availableChapters: 3 })],
      availableCount: 1,
    });
    render(<IntakePanel />);
    expect(screen.getByText('3 chapters available')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument(); // creatable → checkbox
    expect(screen.getByText(/1 available to create/)).toBeInTheDocument();
  });

  it('creates the picked rows', () => {
    const onCreate = vi.fn();
    mockHook({
      editableRows: [row({ matchStatus: 'matched', availability: 'available', availableChapters: 1 })],
      selected: new Set(['sa-1']),
      onCreate,
    });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Create/ }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('shows a disabled checkbox for a not-yet-available row', () => {
    mockHook({ editableRows: [row({ matchStatus: 'matched', availability: 'waiting' })] });
    render(<IntakePanel />);
    // The checkbox is always shown for alignment, but disabled until available.
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('discards an editable row', () => {
    const onDiscard = vi.fn();
    mockHook({ editableRows: [row()], onDiscard });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard Dr. Stone' }));
    expect(onDiscard).toHaveBeenCalledWith('sa-1');
  });

  it('surfaces an error message', () => {
    mockHook({ errorMessage: 'no active season' });
    render(<IntakePanel />);
    expect(screen.getByText('no active season')).toBeInTheDocument();
  });
});
