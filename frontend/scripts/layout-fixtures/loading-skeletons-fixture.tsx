import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter } from 'react-router';
import { AnimeEditorListRow } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListRow';
import { AnimeEditorListSkeleton } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListSkeleton';
import { CatalogCard } from '../../src/features/catalog/ui/CatalogPanel/CatalogCard';
import { CatalogListRow } from '../../src/features/catalog/ui/CatalogPanel/CatalogListRow';
import { CatalogSkeleton } from '../../src/features/catalog/ui/CatalogPanel/CatalogSkeleton';
import { CATALOG_GRID_CLASS } from '../../src/features/catalog/ui/CatalogPanel/catalog-panel.constants';
import { EpisodeScheduleCard } from '../../src/features/episodes/ui/EpisodeSchedulePanel/EpisodeScheduleCard';
import { EpisodeScheduleSkeleton } from '../../src/features/episodes/ui/EpisodeSchedulePanel/EpisodeScheduleSkeleton';
import { KeymapBindingRow } from '../../src/shared/keyboard/ui/KeymapBindingRow/KeymapBindingRow';
import { KeymapPanelSkeleton } from '../../src/shared/keyboard/ui/KeymapPanel/KeymapPanelSkeleton';
import { AnimeMetadataLookupCandidate } from '../../src/shared/metadata-lookup/ui/AnimeMetadataLookupModal/AnimeMetadataLookupCandidate';
import { LookupCandidateSkeleton } from '../../src/shared/ui/LookupModal/LookupCandidateSkeleton';
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

/**
 * A Catalog anime with a two-line title, a type and genres and the `estado`
 * chip, drawn on the "No Cover" poster: the tallest ordinary card and row.
 */
const CATALOG_ITEM = {
  id: 'anime-1',
  name: 'Frieren: Beyond Journey’s End',
  hasCover: false,
  statusLabel: 'Viendo',
  statusColor: 'accent',
  kindLabel: 'Anime (TV)',
  listMeta: 'Anime (TV) · Adventure, Drama, Fantasy',
} as const;

/** What the Catalog cover slot draws for a record without a stored cover. */
const CATALOG_PLACEHOLDER_COVER = { status: 'placeholder' } as const;

/** An Editor rail row with its cover slot, a name and its watched subtitle. */
const EDITOR_ITEM = {
  id: 'anime-1',
  animeId: 'anime-1',
  nombre: 'Frieren',
  subtitle: '10 watched',
  selected: false,
  hasCover: false,
  cover: { status: 'placeholder' },
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
/** A keymap row carrying a hazard chip and an override, its tallest ordinary shape. */
const KEYMAP_BINDING = {
  id: 'nav.today',
  scope: 'global',
  chord: 'alt+1',
  label: 'Today',
  section: 'Navigation',
} as const;

/** A MyAnimeList candidate carrying a cover thumbnail and its full subtitle, its tallest ordinary shape. */
const METADATA_LOOKUP_CANDIDATE = {
  malId: 41467,
  name: 'Bleach: Sennen Kessen-hen',
  image: 'https://cdn.myanimelist.net/r/116x180/images/anime/1908/135431.jpg',
  mediaType: 'TV',
  startYear: 2022,
  score: '8.98',
} as const;

/** Every surface measured on this page: its real row beside the placeholder that stands in for it. */
const COMPARISONS: readonly SkeletonComparison[] = [
  {
    subject: 'keymap-panel',
    rowTestId: 'keymap-panel-skeleton-row',
    real: (
      <KeymapBindingRow
        binding={KEYMAP_BINDING}
        effectiveChord="ctrl+1"
        hazard={null}
        isOverridden
        onRebind={() => undefined}
        onRevert={() => undefined}
        scopeNote={null}
      />
    ),
    skeleton: <KeymapPanelSkeleton />,
  },
  {
    subject: 'catalog-grid',
    rowTestId: 'catalog-skeleton-card',
    real: (
      <ul className={CATALOG_GRID_CLASS}>
        <CatalogCard cover={CATALOG_PLACEHOLDER_COVER} item={CATALOG_ITEM} onCoverError={() => undefined} />
      </ul>
    ),
    skeleton: <CatalogSkeleton view="grid" />,
  },
  {
    subject: 'catalog-list',
    rowTestId: 'catalog-skeleton-row',
    real: (
      <ul>
        <CatalogListRow cover={CATALOG_PLACEHOLDER_COVER} item={CATALOG_ITEM} onCoverError={() => undefined} />
      </ul>
    ),
    skeleton: <CatalogSkeleton view="list" />,
  },
  {
    subject: 'editor-library',
    rowTestId: 'anime-editor-skeleton-row',
    real: <AnimeEditorListRow item={EDITOR_ITEM} onCoverImageError={noop} onSelectAnime={() => undefined} />,
    skeleton: <AnimeEditorListSkeleton />,
  },
  {
    subject: 'metadata-lookup',
    rowTestId: 'lookup-skeleton-row',
    real: (
      <AnimeMetadataLookupCandidate
        candidate={METADATA_LOOKUP_CANDIDATE}
        isSelected={false}
        onSelect={() => undefined}
      />
    ),
    skeleton: <LookupCandidateSkeleton />,
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

/** Every skeleton-versus-row comparison on the shared fixture page. */
export function LoadingSkeletonsFixture() {
  return (
    <HashRouter>
      {COMPARISONS.map((comparison) => (
        <ComparisonFixture comparison={comparison} key={comparison.subject} />
      ))}
    </HashRouter>
  );
}
