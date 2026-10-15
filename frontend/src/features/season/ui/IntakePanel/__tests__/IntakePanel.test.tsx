import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import {
  METADATA_LOOKUP_CANCEL_LABEL,
  METADATA_LOOKUP_CONFIRM_LABEL,
  METADATA_LOOKUP_TRIGGER_LABEL,
} from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/anime-metadata-lookup.constants';
import type { AnimeMetadataLookupSource } from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';

vi.mock('../use-intake-panel', () => ({
  useIntakePanel: vi.fn(),
}));

/** The mocked panel hook, so a case can state the state it renders. */
const mockedUseIntakePanel = vi.mocked(useIntakePanel);
/** Everything the mocked panel hook returns. */
type HookReturn = ReturnType<typeof useIntakePanel>;

/**
 * Builds one editable intake row, so a case states only the fields it asserts on.
 * @param overrides Per-test row replacements.
 * @returns A pending, uncreated intake row.
 */
function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Dr. Stone',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting', availableEpisodes: 0,
    animeId: '',
    section: '', sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',    ...overrides,
  };
}

/**
 * Builds the two MyAnimeList calls the row lookup modal drives: one search
 * candidate, and that candidate's detail page once it is confirmed.
 * @param overrides Per-test call replacements.
 * @returns A fake lookup source whose calls stay assertable.
 */
function createMetadataSource(overrides: Partial<AnimeMetadataLookupSource> = {}): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'search ok',
      candidates: [{ malId: 2, name: 'Bleach' }],
    }),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'detail ok',
      title: 'Bleach',
      type: 'TV',
      episodes: '366',
      duration: '24 min.',
      source: 'Manga',
      genres: ['Action'],
      studios: ['Studio Pierrot'],
    }),
    ...overrides,
  };
}

/**
 * Builds the panel hook's return value, so a case overrides only the fields it
 * renders instead of restating the whole contract.
 * @param overrides Per-test hook-return replacements.
 * @returns The hook value the mocked hook now returns.
 */
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
    metadataByRow: {},
    appliedMetadataByRow: {},
    metadataLookupSource: createMetadataSource(),
    providerSearchSource: {},
    onMetadataApplied: vi.fn(),
    onMetadataClear: vi.fn(),
    onMetadataUndo: vi.fn(),
    availableCount: 0,
    availabilityPendingCount: 0,
    onCreate: vi.fn(),
    unresolvedCount: 0,
    searchFailedCount: 0,
    errorMessage: undefined,
    busyMessage: undefined,
    matchingRun: null,
    matchingProgressMessage: undefined,
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

  it('surfaces a failed search as its own footer counter', () => {
    mockHook({ editableRows: [row({ matchStatus: 'search_failed' })], unresolvedCount: 0, searchFailedCount: 1 });
    render(<IntakePanel />);
    expect(screen.getByText('Search failed')).toBeInTheDocument();
    expect(screen.getByText(/1 search failed/)).toBeInTheDocument();
  });

  it('hides the search-failed suffix while every search succeeded', () => {
    mockHook({ editableRows: [row()], unresolvedCount: 1, searchFailedCount: 0 });
    render(<IntakePanel />);
    expect(screen.getByText(/1 unresolved/)).toBeInTheDocument();
    expect(screen.queryByText(/search failed/)).not.toBeInTheDocument();
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
      availableCount: 1,
      selected: new Set(['sa-1']),
      onCreate,
    });
    render(<IntakePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Create 1' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dr. Stone' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Discard' }));
    expect(onDiscard).toHaveBeenCalledWith('sa-1');
  });

  it('hides mutation controls in read-only mode', () => {
    mockHook({
      readOnly: true,
      availableCount: 1,
      availabilityPendingCount: 1,
      editableRows: [row({ matchStatus: 'matched', availability: 'available', availableEpisodes: 1 })],
    });
    render(<IntakePanel />);

    expect(screen.queryByRole('button', { name: /^Create/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run matching' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raw' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for Dr. Stone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check availability' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL })).not.toBeInTheDocument();
  });

  it('offers one lookup per row and attaches a confirmed result to that row only', async () => {
    const metadataSource = createMetadataSource();
    const onMetadataApplied = vi.fn();
    mockHook({
      editableRows: [row({ id: 'sa-1' }), row({ id: 'sa-2', rawName: 'Bleach' })],
      metadataLookupSource: metadataSource,
      onMetadataApplied,
    });
    render(<IntakePanel />);

    const triggers = screen.getAllByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL });
    expect(triggers).toHaveLength(2);

    fireEvent.click(triggers[1]);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bleach' } });
    fireEvent.click(await screen.findByRole('button', { name: /Bleach/ }));
    fireEvent.click(screen.getByRole('button', { name: METADATA_LOOKUP_CONFIRM_LABEL }));

    await vi.waitFor(() => {
      expect(onMetadataApplied).toHaveBeenCalledExactlyOnceWith(
        'sa-2',
        expect.objectContaining({ name: 'Bleach', kind: '0' }),
      );
    });
    expect(metadataSource.GetMyAnimeListDetail).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('fetches no detail page for a lookup that is only opened and cancelled', () => {
    const metadataSource = createMetadataSource();
    const onMetadataApplied = vi.fn();
    mockHook({ editableRows: [row()], metadataLookupSource: metadataSource, onMetadataApplied });
    render(<IntakePanel />);

    fireEvent.click(screen.getByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL }));
    fireEvent.click(screen.getByRole('button', { name: METADATA_LOOKUP_CANCEL_LABEL }));

    expect(metadataSource.GetMyAnimeListDetail).not.toHaveBeenCalled();
    expect(onMetadataApplied).not.toHaveBeenCalled();
  });

  it('wires the row menu Undo and Clear to the row that has metadata', () => {
    const onMetadataUndo = vi.fn();
    const onMetadataClear = vi.fn();
    mockHook({
      editableRows: [row({ id: 'sa-1' })],
      metadataByRow: { 'sa-1': { name: 'Dr. Stone', kind: '0' } },
      appliedMetadataByRow: {
        'sa-1': { patch: { name: 'Dr. Stone', kind: '0' }, previous: {}, canUndo: true, appliedFields: ['name', 'kind'], unfilled: [] },
      },
      onMetadataUndo,
      onMetadataClear,
    });
    render(<IntakePanel />);

    expect(screen.getByText('Anime (TV)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dr. Stone' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Undo autofill' }));
    expect(onMetadataUndo).toHaveBeenCalledExactlyOnceWith('sa-1');
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Dr. Stone' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear metadata' }));
    expect(onMetadataClear).toHaveBeenCalledExactlyOnceWith('sa-1');
  });

  it('hints the available episodes only for a creatable row', () => {
    mockHook({
      editableRows: [
        row({ id: 'sa-1', matchStatus: 'matched', availability: 'available', availableEpisodes: 3 }),
        row({ id: 'sa-2', matchStatus: 'matched', availability: 'available', availableEpisodes: 1 }),
        row({ id: 'sa-3', availability: 'waiting', availableEpisodes: 0 }),
      ],
    });
    render(<IntakePanel />);

    expect(screen.getByText('3 episodes available')).toBeInTheDocument();
    // One episode reads as singular, not as "1 episodes".
    expect(screen.getByText('1 episode available')).toBeInTheDocument();
    expect(screen.getAllByText(/episodes? available$/)).toHaveLength(2);
  });

  it.each([
    { label: 'Run matching', shown: { editableRows: [row()] }, hidden: { editableRows: [] } },
    { label: 'Check availability', shown: { availabilityPendingCount: 1 }, hidden: { availabilityPendingCount: 0 } },
    { label: 'Create', shown: { availableCount: 1, selected: new Set(['sa-1']) }, hidden: { availableCount: 0 } },
  ] satisfies { label: string; shown: Partial<HookReturn>; hidden: Partial<HookReturn> }[])(
    'renders the $label footer action only when it can act',
    ({ label, shown, hidden }) => {
      mockHook(hidden);
      const { unmount } = render(<IntakePanel />);
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}`) })).not.toBeInTheDocument();
      unmount();

      mockHook(shown);
      render(<IntakePanel />);
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeEnabled();
    },
  );

  // The selection is never pruned, so a stale pick must keep Create pressable exactly as before the redesign.
  it('keeps Create pressable for a stale selection when nothing is available to create', () => {
    mockHook({ availableCount: 0, selected: new Set(['sa-1']) });
    render(<IntakePanel />);
    expect(screen.getByRole('button', { name: 'Create 1' })).toBeEnabled();
  });

  it('keeps Create disabled while nothing is selected', () => {
    mockHook({ availableCount: 1, selected: new Set<string>() });
    render(<IntakePanel />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
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

  it('names the matching phase with its counts while a run is in flight', () => {
    mockHook({
      matchingRun: { total: 4, resolvedInPhase: 1, phase: 'name_matching' },
      matchingProgressMessage: 'Matching names… 1 of 4',
    });
    render(<IntakePanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Matching names… 1 of 4');
  });

  it('names the availability check instead of the matching while episodes are checked', () => {
    mockHook({
      matchingRun: { total: 4, resolvedInPhase: 2, phase: 'availability_check' },
      matchingProgressMessage: 'Checking episode availability… 2 checked',
    });
    render(<IntakePanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking episode availability… 2 checked');
  });

  it('shows the run progress instead of the generic busy indicator while a run is in flight', () => {
    mockHook({
      busyMessage: 'Matching names against jkanime…',
      matchingRun: { total: 4, resolvedInPhase: 1, phase: 'name_matching' },
      matchingProgressMessage: 'Matching names… 1 of 4',
    });
    render(<IntakePanel />);
    expect(screen.getByRole('status')).toHaveTextContent('Matching names… 1 of 4');
    expect(screen.queryByText('Matching names against jkanime…')).not.toBeInTheDocument();
  });
});
