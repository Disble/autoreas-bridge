import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IntakeRow } from '../IntakeRow';
import type { IntakeAppliedMetadata, IntakeRowProps } from '../intake-panel.types';
import { createMetadataSource, seasonRow } from './intake-panel.test-support';

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
 * Reads the accessible names of the menu's items, in order.
 * @param menu The opened menu.
 * @returns Each item's text.
 */
function menuItemNames(menu: HTMLElement): readonly string[] {
  return within(menu).getAllByRole('menuitem').map((item) => item.textContent);
}

describe('IntakeRow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    { matchStatus: 'pending', label: 'Pending' },
    { matchStatus: 'ambiguous', label: 'Ambiguous' },
    { matchStatus: 'not_found', label: 'Not found' },
    { matchStatus: 'discarded', label: 'Discarded' },
  ])('flags the $matchStatus row with its status chip', ({ matchStatus, label }) => {
    renderRow({ row: seasonRow({ matchStatus }) });

    expect(screen.getByText(label)).toBeInTheDocument();
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

  it('summarizes the held metadata in one muted line under the name', () => {
    renderRow({
      heldMetadata: { name: 'Dr. Stone', kind: '0', totalEpisodes: '24', duration: '23', studios: 'TMS' },
      appliedMetadata: applied(true),
    });

    expect(screen.getByText('Anime (TV) · 24 eps · 23 min · TMS')).toBeInTheDocument();
  });

  it.each([
    { held: undefined, case: 'nothing held' },
    { held: { name: 'Dr. Stone' }, case: 'no summarized field' },
  ])('renders no summary line for $case', ({ held }) => {
    renderRow({ heldMetadata: held });

    expect(screen.queryByTestId('intake-row-summary')).toBeNull();
  });

  it('orders the row actions lookup, page, folder, more', () => {
    renderRow({ row: seasonRow(CREATABLE) });

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'Open the page for Dr. Stone',
      'Set download folder for Dr. Stone',
      'More actions for Dr. Stone',
    ]);
  });

  it('offers no page or folder action to an unmatched row', () => {
    renderRow();

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Fetch metadata',
      'More actions for Dr. Stone',
    ]);
  });

  it('keeps only the page action while the season is read-only', () => {
    renderRow({ row: seasonRow(CREATABLE), readOnly: true, appliedMetadata: applied(true) });

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toStrictEqual([
      'Open the page for Dr. Stone',
    ]);
  });

  it.each([
    { appliedMetadata: applied(true), items: ['Undo autofill', 'Clear metadata', 'Discard'] },
    { appliedMetadata: applied(false), items: ['Clear metadata', 'Discard'] },
    { appliedMetadata: undefined, items: ['Discard'] },
  ])('offers $items in the more-actions menu', ({ appliedMetadata, items }) => {
    renderRow({ appliedMetadata });

    expect(menuItemNames(openMoreMenu())).toStrictEqual(items);
  });

  it.each([
    { item: 'Undo autofill', callback: 'onMetadataUndo' },
    { item: 'Clear metadata', callback: 'onMetadataClear' },
    { item: 'Discard', callback: 'onDiscard' },
  ] as const)('runs $callback from the $item menu item', ({ item, callback }) => {
    const props = renderRow({ appliedMetadata: applied(true) });

    fireEvent.click(within(openMoreMenu()).getByRole('menuitem', { name: item }));

    expect(props[callback]).toHaveBeenCalledOnce();
  });

  it('lets a creatable row be picked for creation', () => {
    const props = renderRow({ row: seasonRow(CREATABLE) });

    expect(screen.getByRole('checkbox')).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox'));

    expect(props.onToggleSelect).toHaveBeenCalledOnce();
  });

  it('resolves an unresolved match to the pressed candidate', () => {
    const candidates = [{ title: 'Dr. Stone', pageUrl: 'https://jkanime.net/dr-stone/', score: 0.91 }];
    const props = renderRow({ row: seasonRow({ matchStatus: 'ambiguous', candidates }) });

    fireEvent.click(screen.getByRole('button', { name: 'Dr. Stone (91%)' }));

    expect(props.onResolve).toHaveBeenCalledExactlyOnceWith('https://jkanime.net/dr-stone/');
  });

  it.each([
    { folderOverride: undefined, folderPreview: undefined, title: 'Default download folder', tint: 'hover:text-success' },
    { folderOverride: 'E:/Anime/Stone', folderPreview: 'E:/Anime/Stone', title: 'E:/Anime/Stone', tint: 'text-success' },
  ])('labels the folder button with $title and tints it $tint', ({ folderOverride, folderPreview, title, tint }) => {
    renderRow({ row: seasonRow(CREATABLE), folderOverride, folderPreview });

    expect(screen.getByTitle(title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set download folder for Dr. Stone' })).toHaveClass(tint);
  });

  it.each([
    { availability: 'available', label: 'Available to create', color: 'bg-success' },
    { availability: 'waiting', label: 'Waiting for episode 1', color: 'bg-danger' },
  ])('ends a matched row with the $color availability dot', ({ availability, label, color }) => {
    renderRow({ row: seasonRow({ ...CREATABLE, availability }) });

    expect(screen.getByLabelText(label)).toHaveClass('size-2.5', 'rounded-full', color);
  });

  it('shows no availability dot while the row is still being matched', () => {
    renderRow();

    expect(screen.queryByLabelText(/Available to create|Waiting for episode 1/)).toBeNull();
  });
});
