import type { Key, Selection } from '@heroui/react';
import type { IconifyIcon } from '@iconify/react';
import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { PageProgressiveWindow } from '../../../../shared/hooks/use-page-progressive-window.types';
import type { LabeledSelectOption } from '../../../../shared/ui/LabeledSelect.types';

/** How the Catalog orders its anime. */
export type CatalogSortKey = 'name-asc' | 'name-desc' | 'status' | 'kind' | 'last-watched' | 'created';

/** Which layout the Catalog renders its anime in. */
export type CatalogView = 'grid' | 'list';

/** One icon-only button of the view toggle, named by its label. */
export interface CatalogViewOption {
  readonly value: CatalogView;
  readonly label: string;
  readonly icon: IconifyIcon;
}

/** HeroUI soft chip color an `estado` value is drawn with. */
export type CatalogStatusColor = 'accent' | 'success' | 'danger' | 'warning' | 'default';

/**
 * Everything that narrows the Catalog: the free-text search plus the three
 * filters. `statuses` and `kinds` hold numeric values as strings and match
 * any of them; `genres` lists every genre an anime must carry. An empty list
 * means the group is set to All.
 */
export interface CatalogCriteria {
  readonly query: string;
  readonly statuses: readonly string[];
  readonly kinds: readonly string[];
  readonly genres: readonly string[];
}

/** One removable chip naming an active filter in the result line. */
export interface CatalogCriterionChip {
  /** Stable React key, unique among the chips. */
  readonly id: string;
  readonly field: 'statuses' | 'kinds' | 'genres';
  /** The criterion value the chip removes. */
  readonly value: string;
  /** Group name shown before the value, for example `Status`. */
  readonly groupLabel: string;
  readonly valueLabel: string;
}

/** Single selectable option of a Catalog filter group or the sort select. */
export type CatalogOption = LabeledSelectOption;

/** View model one Catalog card or row renders. */
export interface CatalogItemViewModel {
  readonly id: string;
  readonly name: string;
  readonly hasCover: boolean;
  readonly statusLabel: string;
  readonly statusColor: CatalogStatusColor;
  readonly kindLabel: string;
  /** List-row meta line: the type followed by the genres. */
  readonly listMeta: string;
}

/** What one Catalog cover slot draws. */
export type CatalogCover =
  | { readonly status: 'loading' }
  | { readonly status: 'cover'; readonly src: string }
  | { readonly status: 'placeholder' };

/** Everything that decides what one Catalog cover slot draws. */
export interface CatalogCoverInput {
  /** The record reports a stored cover worth asking for. */
  readonly hasCover: boolean;
  /** The cached lookup, when one was started. */
  readonly entry: AnimeCoverEntry | undefined;
  /** The resolved image failed to decode. */
  readonly hasFailed: boolean;
  /** The runtime offers the `getAnimeCover` binding at all. */
  readonly canResolve: boolean;
}

/** Cover lookup for the rendered Catalog items, plus the decode-failure report. */
export interface CatalogCovers {
  readonly getCover: (item: CatalogItemViewModel) => CatalogCover;
  readonly onCoverError: (animeId: string) => void;
}

/** View state returned by the CatalogPanel hook. */
export interface CatalogPanelState extends UseCatalogCriteriaResult, CatalogCovers {
  readonly isLoading: boolean;
  /** Why the last settled request failed, or `undefined` when it succeeded. */
  readonly error: Error | undefined;
  readonly emptyState: CatalogEmptyState;
  /** False only once the catalog resolved with no anime: there is nothing to search, sort or count. */
  readonly hasCatalog: boolean;
  /** Anime the resolved source returned. */
  readonly totalCount: number;
  /** Anime left after the search and filters. */
  readonly matchingCount: number;
  /** Only the currently revealed slice — see `listWindow` and ADR-012. */
  readonly items: readonly CatalogItemViewModel[];
  readonly listWindow: PageProgressiveWindow;
  readonly activeFilterCount: number;
  readonly criterionChips: readonly CatalogCriterionChip[];
  /** A search or filter is narrowing the catalog. */
  readonly hasCriteria: boolean;
  readonly statusOptions: readonly CatalogOption[];
  readonly kindOptions: readonly CatalogOption[];
  readonly genreOptions: readonly CatalogOption[];
  readonly sortOptions: readonly { readonly value: CatalogSortKey; readonly label: string }[];
  /** Opens the Create anime screen. */
  readonly onCreate: () => void;
}

/** Props for the components that render a slice of the Catalog view state. */
export interface CatalogSectionProps {
  readonly state: CatalogPanelState;
}

/** Props for one tag group inside the Filters popover. */
export interface CatalogFilterGroupProps {
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly CatalogOption[];
  readonly selectedKeys: readonly string[];
  readonly onSelectionChange: (selection: Selection) => void;
}

/** Props for one Catalog card or row. */
export interface CatalogItemProps {
  readonly item: CatalogItemViewModel;
  readonly cover: CatalogCover;
  readonly onCoverError: (animeId: string) => void;
}

/** Props for the cover slot of a card, a row or the skeleton beside them. */
export interface CatalogCoverSlotProps {
  readonly animeId: string;
  readonly cover: CatalogCover;
  /** `card` draws the "No cover" label on the poster; `thumb` is too small for it. */
  readonly size: 'card' | 'thumb';
  readonly onCoverError: (animeId: string) => void;
}

/** Props for the loading placeholder of the active view. */
export interface CatalogSkeletonProps {
  readonly view: CatalogView;
}

/** Which Catalog empty state a resolved request produced, if any. */
export type CatalogEmptyState = 'none' | 'actual' | 'criteria';

/** Everything the Catalog empty-state classifier reads, and nothing more. */
export interface CatalogEmptyStateInput {
  readonly isLoading: boolean;
  /** True while the last settled catalog request failed. */
  readonly hasError: boolean;
  /** Rows the resolved source returned, before search and filters. */
  readonly sourceCount: number;
  /** Rows left after search and filters. */
  readonly visibleCount: number;
  readonly criteria: CatalogCriteria;
}

/** Title and description shown by one Catalog empty state. */
export interface CatalogEmptyStateCopy {
  readonly title: string;
  readonly description: string;
}

/**
 * What the Catalog remembers for the rest of the session, so opening an anime
 * detail and coming back restores the screen the user left.
 */
export interface CatalogSessionState {
  readonly criteria: CatalogCriteria;
  readonly sort: CatalogSortKey;
  readonly view: CatalogView;
}

/** Criteria, sort and view values plus the callbacks that change them. */
export interface UseCatalogCriteriaResult {
  readonly criteria: CatalogCriteria;
  readonly sort: CatalogSortKey;
  readonly view: CatalogView;
  readonly onQueryChange: (query: string) => void;
  readonly onStatusSelectionChange: (selection: Selection) => void;
  readonly onKindSelectionChange: (selection: Selection) => void;
  readonly onGenresSelectionChange: (selection: Selection) => void;
  /** Drops the criteria behind the removed result-line chips, by chip id. */
  readonly onCriterionChipsRemove: (chipIds: Iterable<string | number>) => void;
  /** Applies the sort select's key; an unknown key keeps the current sort. */
  readonly onSortChange: (key: Key | null) => void;
  readonly onViewSelectionChange: (selection: Selection) => void;
  /** Restores the three filters, keeping the search. */
  readonly onFiltersReset: () => void;
  /** Restores the search and every filter, keeping sort and view. */
  readonly onClearCriteria: () => void;
}
