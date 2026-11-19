import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { METADATA_LOOKUP_DEBOUNCE_MS } from '../../../../../shared/metadata-lookup/metadata-lookup.constants';
import { IntakeRow } from '../IntakeRow';
import type { IntakeAppliedMetadata, IntakeRowProps } from '../intake-panel.types';
import { createMetadataSource, seasonQueryWrapper, seasonRow } from './intake-panel.test-support';

/** The default season port's provider search read, which the Find on provider case programs. */
const fetchProviderSearch = vi.hoisted(() => vi.fn());

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The provider lookup's default season port. */
  BRIDGE_SEASON_SOURCE: { fetchProviderSearch },
}));

/** A matched row whose episode 1 is online, so every row action applies to it. */
const CREATABLE = { matchStatus: 'matched', matchedSlug: 'https://jkanime.net/dr-stone/', availability: 'available' };

/**
 * Builds an applied-metadata record, so a case states only whether Undo applies.
 * @param canUndo Whether this session holds the pre-image Undo replays.
 * @returns An applied record for one held field.
 */
function applied(canUndo: boolean): IntakeAppliedMetadata {
  return { patch: { kind: '0' }, previous: {}, appliedFields: ['kind'], unfilled: [], canUndo };
}

/**
 * Renders one intake row inside a list with spy callbacks, so a case overrides
 * only the props it is about.
 * @param overrides Per-test prop replacements.
 * @returns The props the row rendered with.
 */
function renderRow(overrides: Partial<IntakeRowProps> = {}): IntakeRowProps {
  const props: IntakeRowProps = {
    row: seasonRow(),
    readOnly: false,
    isSelected: false,
    folderOverride: undefined,
    folderPreview: undefined,
    heldMetadata: undefined,
    appliedMetadata: undefined,
    metadataLookupSource: createMetadataSource(),
    onMetadataApplied: vi.fn(),
    onMetadataUndo: vi.fn(),
    onMetadataClear: vi.fn(),
    onToggleSelect: vi.fn(),
    onPickFolder: vi.fn(),
    onDiscard: vi.fn(),
    onResolve: vi.fn(),
    onOpenPage: vi.fn(),
    ...overrides,
  };
  render(
    <ul>
      <IntakeRow {...props} />
    </ul>,
    { wrapper: seasonQueryWrapper() },
  );
  return props;
}

/**
 * Opens the row's "More actions" menu.
 * @returns The opened menu.
 */
function openMoreMenu(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: 'More actions for Dr. Stone' }));
  return screen.getByRole('menu');
}

/**
 * Reads the labels of the menu's items, in order, leaving out any item description.
 * @param menu The opened menu.
 * @returns Each item's label text.
 */
function menuItemNames(menu: HTMLElement): readonly (string | undefined)[] {
  return within(menu).getAllByRole('menuitem').map((item) => item.querySelector('[data-slot="label"]')?.textContent);
}

describe('IntakeRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('flags a pending row and offers Find on provider, with no summary line and no availability dot', () => {
    renderRow();

    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'Find on provider',
      'More actions for Dr. Stone',
    ]);
    expect(screen.queryByTestId('intake-row-summary')).toBeNull();
    expect(screen.queryByLabelText(/Available to create|Waiting for episode 1/)).toBeNull();
  });

  it('flags an ambiguous row with its status chip and offers Find on provider', () => {
    renderRow({ row: seasonRow({ matchStatus: 'ambiguous' }) });

    expect(screen.getByText('Ambiguous')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'Find on provider',
      'More actions for Dr. Stone',
    ]);
  });

  it('flags the discarded row with its status chip', () => {
    renderRow({ row: seasonRow({ matchStatus: 'discarded' }) });

    expect(screen.getByText('Discarded')).toBeInTheDocument();
  });

  it('shows no status chip for a matched row', () => {
    renderRow({ row: seasonRow({ matchStatus: 'matched' }) });

    expect(screen.queryByText('Matched')).not.toBeInTheDocument();
  });

  it('shows the held metadata cover as the row thumbnail', () => {
    renderRow({ heldMetadata: { coverURL: 'https://cdn.example/stone.jpg' } });

    expect(screen.getByTestId('season-cover-thumb-image')).toHaveAttribute('src', 'https://cdn.example/stone.jpg');
  });

  it('shows the placeholder thumbnail for a row without a cover', () => {
    renderRow({ heldMetadata: { kind: '0' } });

    expect(screen.getByTestId('season-cover-thumb-placeholder')).toBeInTheDocument();
  });

  it('summarizes the held metadata in one muted line under the truncated name', () => {
    renderRow({
      heldMetadata: { name: 'Dr. Stone', kind: '0', totalEpisodes: '24', duration: '23', studios: 'TMS' },
      appliedMetadata: applied(true),
    });

    const name = screen.getByTitle('Dr. Stone');
    expect(name).toHaveClass('truncate');
    expect(name.parentElement).toHaveClass('min-w-0', 'flex-1');
    expect(screen.getByText('Anime (TV) · 24 eps · 23 min · TMS')).toBeInTheDocument();
  });

  it('renders no summary line when no held field is summarized', () => {
    renderRow({ heldMetadata: { name: 'Dr. Stone' } });

    expect(screen.queryByTestId('intake-row-summary')).toBeNull();
  });

  it('orders a creatable row actions, marks it available, picks it and names its default folder', () => {
    const props = renderRow({ row: seasonRow(CREATABLE) });

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'Open the page for Dr. Stone',
      'Set download folder for Dr. Stone',
      'More actions for Dr. Stone',
    ]);
    expect(screen.getByLabelText('Available to create')).toHaveClass('size-2.5', 'rounded-full', 'bg-success');

    // The checkbox leading the row picks it for creation.
    const checkbox = screen.getByRole('checkbox', { name: 'Dr. Stone' });
    expect(checkbox.compareDocumentPosition(screen.getByTestId('season-cover-thumb-placeholder')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checkbox).toBeEnabled();
    fireEvent.click(checkbox);
    expect(props.onToggleSelect).toHaveBeenCalledOnce();

    // One tooltip naming the action, the default folder after it; no native title tooltip.
    const folder = screen.getByRole('button', { name: 'Set download folder for Dr. Stone' });
    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => folder.focus());
    const lines = screen.getByRole('tooltip').querySelectorAll('span > span');
    expect([...lines].map((line) => line.textContent)).toEqual(['Set download folder', 'Default download folder']);
    expect(screen.queryByTitle('Default download folder')).toBeNull();
    expect(folder).toHaveClass('hover:text-success');
  });

  it('offers Find on provider right after Fetch metadata, and no page or folder action, on a search_failed row', () => {
    renderRow({ row: seasonRow({ matchStatus: 'search_failed' }) });

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'Find on provider',
      'More actions for Dr. Stone',
    ]);
  });

  it.each([
    { row: seasonRow(CREATABLE), actions: ['Open the page for Dr. Stone'] },
    { row: seasonRow({ matchStatus: 'not_found' }), actions: [] },
  ])('keeps only $actions while the season is read-only', ({ row, actions }) => {
    renderRow({ row, readOnly: true, appliedMetadata: applied(true) });

    expect(screen.queryAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual(actions);
  });

  it('flags a not-found row, offers Find on provider and resolves it to the picked page', async () => {
    // A clock that still ticks with real time, so `findBy` keeps polling while
    // the case jumps past the search debounce.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const pageUrl = 'https://jkanime.net/dr-stone/';
    fetchProviderSearch.mockResolvedValue({ status: 'ok', pages: [{ title: 'Dr. Stone', pageUrl, provider: 'jkanime' }] });
    const props = renderRow({ row: seasonRow({ matchStatus: 'not_found' }) });

    expect(screen.getByText('Not found')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'Find on provider',
      'More actions for Dr. Stone',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Find on provider' }));
    act(() => {
      vi.advanceTimersByTime(METADATA_LOOKUP_DEBOUNCE_MS);
    });
    fireEvent.click(await screen.findByRole('button', { name: /jkanime\.net\/dr-stone/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this page' }));

    expect(props.onResolve).toHaveBeenCalledExactlyOnceWith(pageUrl);
  });

  it('offers Undo, Clear and Discard for an undoable autofill and runs each from its menu item', () => {
    const props = renderRow({ appliedMetadata: applied(true) });
    const menu = openMoreMenu();

    expect(menuItemNames(menu)).toStrictEqual(['Undo autofill', 'Clear metadata', 'Discard']);
    expect(within(menu).getByRole('menuitem', { name: 'Discard' })).toHaveAccessibleDescription(
      'Moves it to Discarded. Restore it there, or type the same name in Raw again.',
    );

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Undo autofill' }));
    expect(props.onMetadataUndo).toHaveBeenCalledOnce();
    fireEvent.click(within(openMoreMenu()).getByRole('menuitem', { name: 'Clear metadata' }));
    expect(props.onMetadataClear).toHaveBeenCalledOnce();
    fireEvent.click(within(openMoreMenu()).getByRole('menuitem', { name: 'Discard' }));
    expect(props.onDiscard).toHaveBeenCalledOnce();
  });

  it.each([
    { appliedMetadata: applied(false), items: ['Clear metadata', 'Discard'] },
    { appliedMetadata: undefined, items: ['Discard'] },
  ])('offers $items in the more-actions menu, explaining where a discard goes', ({ appliedMetadata, items }) => {
    renderRow({ appliedMetadata });
    const menu = openMoreMenu();

    expect(menuItemNames(menu)).toStrictEqual(items);
    expect(within(menu).getByRole('menuitem', { name: 'Discard' })).toHaveAccessibleDescription(
      'Moves it to Discarded. Restore it there, or type the same name in Raw again.',
    );
  });

  it('resolves an unresolved match to the pressed candidate', () => {
    const candidates = [{ title: 'Dr. Stone', pageUrl: 'https://jkanime.net/dr-stone/', score: 0.91 }];
    const props = renderRow({ row: seasonRow({ matchStatus: 'ambiguous', candidates }) });

    fireEvent.click(screen.getByRole('button', { name: 'Dr. Stone (91%)' }));

    expect(props.onResolve).toHaveBeenCalledExactlyOnceWith('https://jkanime.net/dr-stone/');
  });

  it('names the folder action with the chosen folder on the second line and tints it text-success', () => {
    const title = 'E:/Anime/Stone';
    const tint = 'text-success';
    renderRow({ row: seasonRow(CREATABLE), folderOverride: title, folderPreview: title });
    const folder = screen.getByRole('button', { name: 'Set download folder for Dr. Stone' });

    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => folder.focus());

    // One tooltip naming the action, the folder after it; no second, native title tooltip.
    const lines = screen.getByRole('tooltip').querySelectorAll('span > span');
    expect([...lines].map((line) => line.textContent)).toEqual(['Set download folder', title]);
    expect(screen.queryByTitle(title)).toBeNull();
    expect(folder).toHaveClass(tint);
  });

  it('ends a matched row waiting for episode 1 with the bg-danger availability dot', () => {
    renderRow({ row: seasonRow({ ...CREATABLE, availability: 'waiting' }) });

    expect(screen.getByLabelText('Waiting for episode 1')).toHaveClass('size-2.5', 'rounded-full', 'bg-danger');
  });
});
