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
    availability: 'waiting', availableEpisodes: 0,
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
    readOnly: false,
    mode: 'list',
    switchMode: vi.fn(),
    rawDraft: '',
    onRawChange: vi.fn(),
    editableRows: [],
    selected: new Set<string>(),
    toggleSelect: vi.fn(),
    folderOverrides: {},
    folderPreviews: {},
    onPickFolder: vi.fn(),
    availableCount: 0,
    availabilityPendingCount: 0,
    onCreate: vi.fn(),
    unresolvedCount: 0,
    errorMessage: undefined,
    busyMessage: undefined,
    onRunMatching: vi.fn(),
    onRecheckAvailability: vi.fn(),
    onResolve: vi.fn(),
    onDiscard: vi.fn(),
    onOpenPage: vi.fn(),
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

  it('shows an available row with its episode count and a create checkbox', () => {
    mockHook({
      editableRows: [row({ matchStatus: 'matched', matchedSlug: 'https://jkanime.net/x/', availability: 'available', availableEpisodes: 3 })],
      availableCount: 1,
    });
    render(<IntakePanel />);
    expect(screen.getByText('3 episodes available')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument(); // creatable → checkbox
    expect(screen.getByText(/1 available to create/)).toBeInTheDocument();
  });

  it('creates the picked rows', () => {
    const onCreate = vi.fn();
    mockHook({
      editableRows: [row({ matchStatus: 'matched', availability: 'available', availableEpisodes: 1 })],
      selected: new Set(['sa-1']),
      onCreate,
    });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: /^Create/ }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('shows a disabled checkbox for a not-yet-available row', () => {
    mockHook({ editableRows: [row({ matchStatus: 'matched', availability: 'waiting' })], availabilityPendingCount: 1 });
    render(<IntakePanel />);
    // The checkbox is always shown for alignment, but disabled until available.
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Check availability' })).toBeEnabled();
  });

  it('triggers an availability check from the intake list', () => {
    const onRecheckAvailability = vi.fn();
    mockHook({
      editableRows: [row({ matchStatus: 'matched', availability: 'waiting' })],
      availabilityPendingCount: 1,
      onRecheckAvailability,
    });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Check availability' }));
    expect(onRecheckAvailability).toHaveBeenCalled();
  });

  it('shows the default folder path preview on the folder trigger', () => {
    mockHook({
      editableRows: [row({ matchStatus: 'matched', availability: 'available', availableEpisodes: 1 })],
      folderPreviews: { 'sa-1': 'D:/Anime/Dr. Stone' },
    });
    render(<IntakePanel />);
    expect(screen.getByTitle('D:/Anime/Dr. Stone')).toBeInTheDocument();
  });

  it('opens the matched page in the system browser from the link button', () => {
    const onOpenPage = vi.fn();
    mockHook({
      editableRows: [row({ matchStatus: 'matched', matchedSlug: 'https://jkanime.net/dr-stone/', availability: 'available', availableEpisodes: 1 })],
      onOpenPage,
    });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the page for Dr. Stone' }));
    expect(onOpenPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
  });

  it('discards an editable row', () => {
    const onDiscard = vi.fn();
    mockHook({ editableRows: [row()], onDiscard });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard Dr. Stone' }));
    expect(onDiscard).toHaveBeenCalledWith('sa-1');
  });

  it('hides mutation controls in read-only mode', () => {
    mockHook({
      readOnly: true,
      editableRows: [row({ matchStatus: 'matched', availability: 'available', availableEpisodes: 1 })],
    });
    render(<IntakePanel />);

    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run matching' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raw' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard Dr. Stone' })).not.toBeInTheDocument();
  });

  it('surfaces an error message', () => {
    mockHook({ errorMessage: 'no active season' });
    render(<IntakePanel />);
    expect(screen.getByText('no active season')).toBeInTheDocument();
  });

  it('shows a processing indicator while an operation is in flight', () => {
    mockHook({ busyMessage: 'Checking episode availability…' });
    render(<IntakePanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking episode availability…');
  });
});
