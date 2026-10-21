import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogResultLine } from '../CatalogResultLine';
import { CatalogToolbar } from '../CatalogToolbar';
import type { CatalogPanelState } from '../catalog-panel.types';
import { createCatalogState } from './catalog-panel.test-support';

/**
 * Renders the toolbar and the result line over the given view state.
 * @param overrides The view-state fields a case cares about.
 * @returns The view state rendered.
 */
function renderControls(overrides: Partial<CatalogPanelState> = {}): CatalogPanelState {
  const state = createCatalogState({ totalCount: 4, matchingCount: 4, ...overrides });
  render(
    <>
      <CatalogToolbar state={state} />
      <CatalogResultLine state={state} />
    </>,
  );
  return state;
}

/**
 * Opens the Filters popover.
 * @returns The Filters dialog.
 */
async function openFilters(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }));
  return screen.findByRole('dialog', { name: 'Filters' });
}

/**
 * Reads the keys a selection callback last received. React Aria passes its own
 * `Set` subclass, which carries anchor keys a plain `Set` comparison rejects.
 * @param callback The spied selection callback.
 * @returns The selected keys, in selection order.
 */
function lastSelectionKeys(callback: unknown): readonly unknown[] {
  const lastCall = vi.mocked(callback as (keys: Iterable<unknown>) => void).mock.lastCall;
  if (lastCall === undefined) {
    throw new Error('the selection callback was never called');
  }
  return Array.from(lastCall[0]);
}

afterEach(cleanup);

describe('CatalogToolbar', () => {
  it('reports the search and clears it with Esc', async () => {
    const state = renderControls({ criteria: { query: 'fri', statuses: [], kinds: [], genres: [] } });
    const search = screen.getByRole('searchbox', { name: 'Search animes' });

    fireEvent.change(search, { target: { value: 'frie' } });
    expect(state.onQueryChange).toHaveBeenLastCalledWith('frie');
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(state.onQueryChange).toHaveBeenLastCalledWith('');
  });

  it.each([
    [0, 'Filters', null],
    [2, 'Filters, 2 active', '2'],
  ])('counts %i active filters on the Filters button', (activeFilterCount, name, badge) => {
    renderControls({ activeFilterCount });

    expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-filter-count')?.textContent ?? null).toBe(badge);
  });

  it('shows the current filters selected, selects tags, resets them and closes onto the result', async () => {
    const state = renderControls({ matchingCount: 3, criteria: { query: '', statuses: ['1'], kinds: ['0'], genres: ['Drama'] } });
    const dialog = await openFilters();

    expect(within(dialog).getByText('Shows anime that have every selected genre.')).toBeInTheDocument();
    for (const selected of ['Finalizado', 'Anime (TV)', 'Drama']) {
      expect(within(dialog).getByRole('row', { name: selected })).toHaveAttribute('aria-selected', 'true');
    }
    fireEvent.click(within(dialog).getByRole('row', { name: 'Viendo' }));
    expect(lastSelectionKeys(state.onStatusSelectionChange)).toEqual(['1', '0']);
    fireEvent.click(within(dialog).getByRole('row', { name: 'OVA' }));
    expect(lastSelectionKeys(state.onKindSelectionChange)).toEqual(['0', '3']);
    fireEvent.click(within(dialog).getByRole('row', { name: 'Drama' }));
    expect(lastSelectionKeys(state.onGenresSelectionChange)).toEqual([]);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset filters' }));
    expect(state.onFiltersReset).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show 3 anime' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes the Filters popover from its close button', async () => {
    renderControls();
    const dialog = await openFilters();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close filters' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('switches the view from the icon-only toggle', async () => {
    const state = renderControls();

    expect(screen.getByRole('radio', { name: 'Grid view' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'List view' }));

    expect(lastSelectionKeys(state.onViewSelectionChange)).toEqual(['list']);
  });

  it('applies the sort picked from the select', async () => {
    const state = renderControls();

    expect(screen.getByRole('button', { name: /Name A–Z/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Name A–Z/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Status' }));

    expect(state.onSortChange).toHaveBeenCalledWith('status');
  });
});

describe('CatalogResultLine', () => {
  it('removes the criterion behind a chip and clears every criterion', async () => {
    const state = renderControls({
      matchingCount: 1,
      hasCriteria: true,
      criterionChips: [{ id: 'status:0', field: 'statuses', value: '0', groupLabel: 'Status', valueLabel: 'Viendo' }],
    });
    const chip = within(screen.getByRole('grid', { name: 'Active filters' })).getByRole('row', { name: 'Status: Viendo' });

    fireEvent.click(within(chip).getByRole('button'));
    expect(lastSelectionKeys(state.onCriterionChipsRemove)).toEqual(['status:0']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(state.onClearCriteria).toHaveBeenCalledTimes(1);
  });

  it('offers no chips and no clear action without criteria', () => {
    renderControls();

    expect(screen.queryByRole('grid', { name: 'Active filters' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear search and filters' })).toBeNull();
  });
});
