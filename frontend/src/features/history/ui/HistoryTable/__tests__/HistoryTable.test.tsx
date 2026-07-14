import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { HistoryTable } from '../HistoryTable';

// Spy instead of vi.mock: with deps.optimizer enabled, importOriginal-based
// partial mocks cannot re-import the original module.
const navigateMock = vi.fn();
import * as useHistoryTableModule from '../use-history-table';
import {
  HISTORY_TABLE_ESTADO_OPTIONS,
  HISTORY_TABLE_SORT_OPTIONS,
  HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
  HISTORY_TABLE_TIPO_OPTIONS,
} from '../history-table.constants';
import type { HistoryTableState } from '../history-table.types';

function mockState(overrides: Partial<HistoryTableState>): HistoryTableState {
  return {
    rows: [],
    isLoading: false,
    isEmpty: true,
    searchQuery: '',
    estadoFilter: 'all',
    estadoOptions: HISTORY_TABLE_ESTADO_OPTIONS,
    tipoFilter: 'all',
    tipoOptions: HISTORY_TABLE_TIPO_OPTIONS,
    sortOrder: HISTORY_TABLE_SORT_ULT_CAP_VISTO_VALUE,
    sortOptions: HISTORY_TABLE_SORT_OPTIONS,
    page: 1,
    totalPages: 1,
    pageItems: [1],
    onSearchQueryChange: vi.fn(),
    onEstadoFilterChange: vi.fn(),
    onTipoFilterChange: vi.fn(),
    onSortOrderChange: vi.fn(),
    onPageChange: vi.fn(),
    ...overrides,
  };
}

function renderTable(overrides: Partial<HistoryTableState>) {
  vi.spyOn(ReactRouter, 'useNavigate').mockReturnValue(navigateMock);
  vi.spyOn(useHistoryTableModule, 'useHistoryTable').mockReturnValue(mockState(overrides));

  return render(
    <MemoryRouter>
      <HistoryTable />
    </MemoryRouter>,
  );
}

describe('HistoryTable', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    navigateMock.mockClear();
  });

  it('renders a visible search input and estado filter control', () => {
    renderTable({});

    expect(screen.getByRole('searchbox', { name: /search history/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filter by status/i })).toBeInTheDocument();
  });

  it('renders a visible "Search" label aligned with the other filter-row controls', () => {
    renderTable({});

    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('renders a visible Tipo filter control', () => {
    renderTable({});

    expect(screen.getByRole('button', { name: /filter by type/i })).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('renders a visible Sort control', () => {
    renderTable({});

    expect(screen.getByRole('button', { name: /sort order/i })).toBeInTheDocument();
    expect(screen.getByText('Sort')).toBeInTheDocument();
  });

  it('renders a skeleton loading state', () => {
    renderTable({ isLoading: true, isEmpty: false });

    expect(screen.getByText('Loading history...')).toBeInTheDocument();
  });

  it('renders an explicit empty state when zero entries match', () => {
    renderTable({ isLoading: false, isEmpty: true, rows: [] });

    expect(screen.getByText('No history yet')).toBeInTheDocument();
    expect(screen.getByText('No animes match the current search and filters.')).toBeInTheDocument();
  });

  it('renders the Legacy Historial columns for a row', () => {
    renderTable({
      isLoading: false,
      isEmpty: false,
      rows: [
        {
          id: 'anime-1',
          rowNumber: 1,
          nombre: 'Frieren',
          nrocapvisto: 12,
          longDateLabel: 'June 30, 2026',
          weekdayLabel: 'Tuesday',
          timeLabel: '12:12',
          relativeRecencyLabel: '2 days ago',
          estado: 1,
          estadoLabel: 'Finalizado',
          estadoColor: 'success',
        },
      ],
    });

    expect(screen.getByRole('rowheader', { name: '1' })).toBeInTheDocument();
    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('June 30, 2026')).toBeInTheDocument();
    expect(screen.getByText('2 days ago')).toBeInTheDocument();
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
    expect(screen.getByText('12:12')).toBeInTheDocument();
    expect(screen.getByText('Finalizado', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Frieren/ })).toHaveAttribute('href', '/catalog/detail/anime-1');
  });

  it('navigates to the anime detail when the row is activated anywhere, not just the name link', () => {
    renderTable({
      isLoading: false,
      isEmpty: false,
      rows: [
        {
          id: 'anime-1',
          rowNumber: 1,
          nombre: 'Frieren',
          nrocapvisto: 12,
          longDateLabel: 'June 30, 2026',
          weekdayLabel: 'Tuesday',
          timeLabel: '12:12',
          relativeRecencyLabel: '2 days ago',
          estado: 1,
          estadoLabel: 'Finalizado',
          estadoColor: 'success',
        },
      ],
    });

    fireEvent.click(screen.getByRole('rowheader', { name: '1' }));

    expect(navigateMock).toHaveBeenCalledWith('/catalog/detail/anime-1');
  });

  it('renders pagination controls showing the current page and total', () => {
    renderTable({
      isLoading: false,
      isEmpty: false,
      page: 2,
      totalPages: 5,
      pageItems: [1, 2, 3, 4, 5],
      rows: [
        {
          id: 'anime-1',
          rowNumber: 11,
          nombre: 'Frieren',
          nrocapvisto: 12,
          longDateLabel: 'June 30, 2026',
          weekdayLabel: 'Tuesday',
          timeLabel: '12:12',
          relativeRecencyLabel: '2 days ago',
          estado: 1,
          estadoLabel: 'Finalizado',
          estadoColor: 'success',
        },
      ],
    });

    expect(screen.getByText(/page 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page 5' })).toBeInTheDocument();
  });

  it('renders numbered page links with ellipsis gaps for a windowed range', () => {
    renderTable({
      isLoading: false,
      isEmpty: true,
      page: 5,
      totalPages: 10,
      pageItems: [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10],
    });

    for (const pageNumber of [1, 4, 5, 6, 10]) {
      expect(screen.getByRole('button', { name: `Page ${pageNumber}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Page 2' })).not.toBeInTheDocument();
  });

  it('disables the previous control on the first page and the next control on the last page', () => {
    renderTable({ isLoading: false, isEmpty: true, page: 1, totalPages: 1 });

    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
