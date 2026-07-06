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
    availability: 'waiting',
    animeId: '',
    section: '',
    ...overrides,
  };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    mode: 'list',
    switchMode: vi.fn(),
    rawDraft: '',
    onRawChange: vi.fn(),
    editableRows: [],
    createdRows: [],
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
    expect(screen.getByText('1 unresolved')).toBeInTheDocument();
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

  it('renders the read-only created section', () => {
    mockHook({
      createdRows: [row({ id: 'c', rawName: 'Akane-banashi', availability: 'created', animeId: 'anime-c', section: 'Ver hoy' })],
    });
    render(<IntakePanel />);
    expect(screen.getByText('Already created (1)')).toBeInTheDocument();
    expect(screen.getByText('Akane-banashi')).toBeInTheDocument();
    expect(screen.getByText('Ver hoy')).toBeInTheDocument();
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
