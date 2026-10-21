import { vi } from 'vitest';
import type { Anime } from '../../../../../shared/contracts/anime.types';
import {
  CATALOG_DEFAULT_CRITERIA,
  CATALOG_KIND_OPTIONS,
  CATALOG_SORT_OPTIONS,
  CATALOG_STATUS_OPTIONS,
} from '../catalog-panel.constants';
import type { CatalogItemViewModel, CatalogPanelState } from '../catalog-panel.types';

/**
 * Fixtures shared by the Catalog suites, so the hook, the panel and the toolbar
 * suites build records and view state the same way.
 */

/**
 * Builds a runtime anime record with benign defaults.
 * @param overrides The fields a case cares about.
 * @returns A complete `Anime` record.
 */
export function createAnime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: 'anime-1',
    name: 'Anime 1',
    status: 0,
    episodesWatched: 0,
    active: 1,
    kind: 0,
    days: [],
    genres: [],
    hasDownloadPage: true,
    hasFolder: true,
    hasCover: false,
    ...overrides,
  };
}

/**
 * Builds the view model one card or row renders.
 * @param overrides The fields a case cares about.
 * @returns A complete `CatalogItemViewModel`.
 */
export function createCatalogItem(overrides: Partial<CatalogItemViewModel> = {}): CatalogItemViewModel {
  return {
    id: 'anime-1',
    name: 'Frieren',
    hasCover: false,
    statusLabel: 'Viendo',
    statusColor: 'accent',
    kindLabel: 'OVA',
    listMeta: 'OVA · Drama',
    ...overrides,
  };
}

/**
 * Builds a resolved, unfiltered Catalog view state whose callbacks are spies,
 * so each case overrides only what it exercises.
 * @param overrides The view-state fields a case cares about.
 * @returns A complete `CatalogPanelState`.
 */
export function createCatalogState(overrides: Partial<CatalogPanelState> = {}): CatalogPanelState {
  return {
    criteria: CATALOG_DEFAULT_CRITERIA,
    sort: 'name-asc',
    view: 'grid',
    onQueryChange: vi.fn(),
    onStatusSelectionChange: vi.fn(),
    onKindSelectionChange: vi.fn(),
    onGenresSelectionChange: vi.fn(),
    onCriterionChipsRemove: vi.fn(),
    onSortChange: vi.fn(),
    onViewSelectionChange: vi.fn(),
    onFiltersReset: vi.fn(),
    onClearCriteria: vi.fn(),
    getCover: vi.fn().mockReturnValue({ status: 'placeholder' }),
    onCoverError: vi.fn(),
    isLoading: false,
    error: undefined,
    emptyState: 'none',
    hasCatalog: true,
    totalCount: 0,
    matchingCount: 0,
    items: [],
    listWindow: { visibleCount: 20 },
    activeFilterCount: 0,
    criterionChips: [],
    hasCriteria: false,
    statusOptions: CATALOG_STATUS_OPTIONS,
    kindOptions: CATALOG_KIND_OPTIONS,
    genreOptions: [{ value: 'Drama', label: 'Drama' }],
    sortOptions: CATALOG_SORT_OPTIONS,
    onCreate: vi.fn(),
    ...overrides,
  };
}
