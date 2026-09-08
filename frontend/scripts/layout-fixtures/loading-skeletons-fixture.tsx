import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter } from 'react-router';
import { AnimeEditorListRow } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListRow';
import { AnimeEditorListSkeleton } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListSkeleton';
import { CatalogListRow } from '../../src/features/catalog/ui/CatalogPanel/CatalogListRow';
import { CatalogListSkeleton } from '../../src/features/catalog/ui/CatalogPanel/CatalogListSkeleton';
import { EpisodeScheduleCard } from '../../src/features/episodes/ui/EpisodeSchedulePanel/EpisodeScheduleCard';
import { EpisodeScheduleSkeleton } from '../../src/features/episodes/ui/EpisodeSchedulePanel/EpisodeScheduleSkeleton';
import { NetworkTable } from '../../src/features/network/ui/NetworkTable/NetworkTable';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the loading skeletons.
 *
 * A skeleton exists to stop the content jumping when it arrives. That promise
 * is a measurement, and it is one jsdom cannot make: with no layout engine, a
 * placeholder half the height of the row it stands in for passes every unit
 * test in the suite. This page renders each production skeleton beside the
 * production row it mirrors, at the same width, in headless Edge, and compares
 * what the browser actually laid out.
 */

/** How far a placeholder row may sit from the real row's height. */
const ROW_HEIGHT_TOLERANCE_PX = 6;

/** The fewest placeholder rows a surface may draw and still read as a list. */
const MIN_PLACEHOLDER_ROWS = 2;

/** Container width every comparison is measured at, wide enough for all three rows. */
const COMPARISON_WIDTH_PX = 420;

/** One surface's real row and its placeholder, rendered for measurement. */
interface SkeletonComparison {
  readonly subject: string;
  /** The `data-testid` each placeholder row of this surface carries. */
  readonly rowTestId: string;
  readonly real: ReactNode;
  readonly skeleton: ReactNode;
}

/** A Catalog row carrying both chips, its tallest ordinary shape. */
const CATALOG_ITEM = {
  id: 'anime-1',
  nombre: 'Frieren: Beyond Journey’s End',
  estado: 0,
  progressLabel: '10 / 28',
  status: 'active',
  statusLabel: 'Active',
  hasDownloadPage: false,
  hasFolder: true,
  hasDownloadGap: true,
  gapLabel: 'Missing page',
} as const;

/** An Editor rail row with a name and its watched subtitle. */
const EDITOR_ITEM = {
  id: 'anime-1',
  animeId: 'anime-1',
  nombre: 'Frieren',
  subtitle: '10 watched',
  selected: false,
} as const;

/** A Today schedule row with no cover, the placeholder-cover shape. */
const EPISODE_ROW = {
  id: 'anime-1',
  name: 'Frieren',
  stateLabel: 'Viendo',
  isProgressBlocked: false,
  watchedLabel: '10 watched',
  remainingLabel: '18 remaining',
  progressTitle: '10 / 28',
  totalLabel: '28',
  modifiedAt: 1000,
  hasPage: true,
  hasFolder: true,
  folderPath: '/anime/frieren',
  pageUrl: 'https://example.com/frieren',
  showCoverPlaceholder: true,
} as const;

/** A no-op async handler, so the real rows render their full interactive shape. */
async function noop(): Promise<void> {
  return undefined;
}

/** Every surface whose placeholder must match the row it replaces. */
const COMPARISONS: readonly SkeletonComparison[] = [
  {
    subject: 'catalog',
    rowTestId: 'catalog-skeleton-row',
    real: <menu className="m-0 list-none p-0"><CatalogListRow item={CATALOG_ITEM} /></menu>,
    skeleton: <CatalogListSkeleton />,
  },
  {
    subject: 'editor-library',
    rowTestId: 'anime-editor-skeleton-row',
    real: <AnimeEditorListRow item={EDITOR_ITEM} onSelectAnime={() => undefined} />,
    skeleton: <AnimeEditorListSkeleton />,
  },
  {
    subject: 'today',
    rowTestId: 'episode-schedule-skeleton-row',
    real: (
      <EpisodeScheduleCard
        adjustWatchedEpisodes={noop}
        copyAnimeFolder={noop}
        copyAnimePage={noop}
        openAnimeFolder={noop}
        openAnimePage={noop}
        row={EPISODE_ROW}
        setAnimeState={noop}
      />
    ),
    skeleton: <EpisodeScheduleSkeleton />,
  },
];

/**
 * Compares what the browser laid out for one surface's placeholder against its
 * real row.
 *
 * @param subject Which surface is being measured, for the report.
 * @param rowTestId The `data-testid` this surface's placeholder rows carry.
 * @returns Every check this surface must pass.
 */
function measureComparison(subject: string, rowTestId: string): readonly Check[] {
  const realRow = document.querySelector(`[data-skeleton-real="${subject}"] > *`);
  const placeholders = document.querySelectorAll(`[data-skeleton-placeholder="${subject}"] [data-testid="${rowTestId}"]`);
  const firstPlaceholder = placeholders.item(0);

  if (realRow === null || firstPlaceholder === null) {
    return [describeMissingPair(subject, realRow, placeholders.length)];
  }

  return [
    checkTheHeights(realRow.getBoundingClientRect(), firstPlaceholder.getBoundingClientRect(), subject),
    checkTheCount(placeholders.length, subject),
    checkThePage(subject),
  ];
}

/** Names which half of the pair failed to mount, since "nothing rendered" is a dead end. */
function describeMissingPair(subject: string, realRow: Element | null, placeholderCount: number): Check {
  return {
    name: `${subject}: the real row and its placeholder both rendered`,
    ok: false,
    detail: `real row ${realRow === null ? 'absent' : 'present'}, placeholder rows ${placeholderCount}`,
  };
}

/** A single placeholder block reads as one wide row rather than as a pending list. */
function checkTheCount(placeholderCount: number, subject: string): Check {
  return {
    name: `${subject}: the placeholder reads as a list, not a single block`,
    ok: placeholderCount >= MIN_PLACEHOLDER_ROWS,
    detail: `${placeholderCount} placeholder row(s), floor ${MIN_PLACEHOLDER_ROWS}`,
  };
}

/**
 * The promise a skeleton makes: the content does not move when it arrives.
 *
 * @param realBox The row that will replace the placeholder.
 * @param placeholderBox The placeholder standing in for it.
 * @param subject Which surface is being measured.
 * @returns The height-match check.
 */
function checkTheHeights(realBox: DOMRect, placeholderBox: DOMRect, subject: string): Check {
  const drift = Math.abs(realBox.height - placeholderBox.height);

  return {
    name: `${subject}: the placeholder is the height of the row it replaces`,
    ok: drift <= ROW_HEIGHT_TOLERANCE_PX,
    detail: `placeholder ${Math.round(placeholderBox.height)}px vs row ${Math.round(realBox.height)}px, drift ${Math.round(drift)}px, tolerance ${ROW_HEIGHT_TOLERANCE_PX}px`,
  };
}

/**
 * Mounts one surface's real row and placeholder side by side and measures them
 * once both are in the document.
 *
 * @param comparison The surface under measurement.
 * @returns The mounted pair with its own verdict node.
 */
function ComparisonFixture({ comparison }: Readonly<{ comparison: SkeletonComparison }>) {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();
  const { subject, rowTestId } = comparison;

  useEffect(() => {
    return measureWhenReady(
      () => document.querySelector(`[data-skeleton-placeholder="${subject}"] [data-testid="${rowTestId}"]`) !== null,
      () => setChecks(measureComparison(subject, rowTestId)),
    );
  }, [rowTestId, subject]);

  return (
    <>
      <div className="flex gap-4" style={{ width: `${COMPARISON_WIDTH_PX * 2 + 16}px` }}>
        <div data-skeleton-real={subject} style={{ width: `${COMPARISON_WIDTH_PX}px` }}>{comparison.real}</div>
        <div data-skeleton-placeholder={subject} style={{ width: `${COMPARISON_WIDTH_PX}px` }}>{comparison.skeleton}</div>
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}

/** One runtime-event row, enough to give the real table a measurable body row. */
const NETWORK_ROW = {
  id: 'event-1',
  timeLabel: '12:04:31',
  domain: 'anime',
  level: 'info',
  message: 'Reconcile finished for 42 anime',
  statusLabel: 'ok',
  durationLabel: '128 ms',
} as const;

/**
 * Measures a skeleton `Table.Row` against a real one.
 *
 * Tables get their own comparison because their placeholder promise is
 * stronger than a list's: the header and the column widths must survive the
 * swap, which is why the rows are placeholders rather than a replacement of
 * the whole table. Two tables at the same width, one loading and one loaded.
 */
function TableComparisonFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => {
    return measureWhenReady(
      () => document.querySelector('[data-skeleton-placeholder="network-table"] [data-testid="network-table-skeleton-row"]') !== null,
      () => setChecks(measureTableComparison()),
    );
  }, []);

  return (
    <>
      <div className="flex gap-4" style={{ width: `${COMPARISON_WIDTH_PX * 2 + 16}px` }}>
        <div data-skeleton-real="network-table" style={{ width: `${COMPARISON_WIDTH_PX}px` }}>
          <NetworkTable emptyMessage="" isLoading={false} onScroll={() => undefined} onSelect={() => undefined} rows={[NETWORK_ROW]} selectedId={null} />
        </div>
        <div data-skeleton-placeholder="network-table" style={{ width: `${COMPARISON_WIDTH_PX}px` }}>
          <NetworkTable emptyMessage="" isLoading onScroll={() => undefined} onSelect={() => undefined} rows={[]} selectedId={null} />
        </div>
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}

/**
 * Reads back the loaded table's real row and the loading table's first
 * placeholder row, plus the header both must keep.
 *
 * @returns Every check the table placeholder must pass.
 */
function measureTableComparison(): readonly Check[] {
  const realRow = document.querySelector('[data-skeleton-real="network-table"] [role="row"]:not([aria-rowindex="1"])');
  const placeholderRow = document.querySelector('[data-skeleton-placeholder="network-table"] [data-testid="network-table-skeleton-row"]');

  if (realRow === null || placeholderRow === null) {
    return [describeMissingPair('network-table', realRow, countPlaceholderRows())];
  }

  return [
    checkTheHeights(realRow.getBoundingClientRect(), placeholderRow.getBoundingClientRect(), 'network-table'),
    checkTheHeader(),
    checkThePage('network-table'),
  ];
}

/** How many placeholder rows the loading table drew, for the missing-pair report. */
function countPlaceholderRows(): number {
  return document.querySelectorAll('[data-skeleton-placeholder="network-table"] [data-testid="network-table-skeleton-row"]').length;
}

/**
 * The reason a table swaps ROWS rather than replacing itself: losing the header
 * would let the columns appear and resize the moment data lands.
 */
function checkTheHeader(): Check {
  const loadingHeader = document.querySelector('[data-skeleton-placeholder="network-table"] [role="columnheader"]');

  return {
    name: 'network-table: the header survives the loading swap',
    ok: loadingHeader !== null,
    detail: loadingHeader === null ? 'no column header while loading' : 'column header present while loading',
  };
}

/** Every skeleton-versus-row comparison on the shared fixture page. */
export function LoadingSkeletonsFixture() {
  return (
    <HashRouter>
      {COMPARISONS.map((comparison) => (
        <ComparisonFixture comparison={comparison} key={comparison.subject} />
      ))}
      <TableComparisonFixture />
    </HashRouter>
  );
}
