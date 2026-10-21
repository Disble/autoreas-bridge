import { useEffect, useState } from 'react';
import { AnimeDetailMainCard } from '../../src/features/anime-detail/ui/AnimeDetail/AnimeDetailMainCard';
import { toAnimeDetailViewModel } from '../../src/features/anime-detail/ui/AnimeDetail/anime-detail.helpers';
import type { AnimeDetail } from '../../src/shared/contracts/anime.types';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for Anime Detail's main card.
 *
 * The card lays itself out from its OWN width through container queries, which
 * jsdom cannot evaluate. It is mounted at three column widths, one per layout,
 * with the no-cover poster and hostile strings, and headless Edge measures what
 * each width promises: the cover column or thumbnail size, the cover stretched
 * to the body at full size, the General data column count, the "No cover" pill
 * only at full size, and nothing widening its column.
 */

/** One measured width and the layout it must produce. */
interface DetailCardCase {
  readonly width: number;
  readonly coverWidth: number;
  readonly fieldColumns: number;
  readonly showsPill: boolean;
  /** Whether the cover column stretches to the body's height (full size only). */
  readonly stretchesCover: boolean;
}

/** Full size, compact, and narrow: one case per container breakpoint. */
const CASES: readonly DetailCardCase[] = [
  { width: 900, coverWidth: 280, fieldColumns: 3, showsPill: true, stretchesCover: true },
  { width: 560, coverWidth: 68, fieldColumns: 2, showsPill: false, stretchesCover: false },
  { width: 380, coverWidth: 76, fieldColumns: 1, showsPill: false, stretchesCover: false },
];

/** How far a measured box may drift from its expected size. */
const TOLERANCE_PX = 1;

/** A long anime title, kept verbatim from the toast fixture's overflow case. */
const LONG_NAME = 'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen - Ryoushu no Youjo';

/** A loaded record without a cover and with an unbroken folder path and URL. */
const HOSTILE_DETAIL: AnimeDetail = {
  id: 'fixture-anime',
  name: LONG_NAME,
  status: 1,
  episodesWatched: 12,
  totalEpisodes: 28,
  durationMinutes: 24,
  active: 0,
  kind: 0,
  firstCycle: 1,
  days: [],
  genres: ['Fantasy', 'Adventure', 'Slice of Life', 'Isekai'],
  modified_at: 1,
  folder: 'D:\\Anime\\Honzuki_no_Gekokujou_Shisho_ni_Naru_Tame_ni_wa_Shudan_wo_Erandeiraremasen_Ryoushu_no_Youjo',
  sourceUrl: 'https://myanimelist.net/anime/51019/Honzuki_no_Gekokujou__Shisho_ni_Naru_Tame_ni_wa_Shudan_wo_Erandeiraremasen_3rd_Season',
  studios: 'Ajia-do',
  origin: 'Light novel',
};

/**
 * Counts the distinct column positions the General data fields occupy.
 *
 * @param column The case's column element.
 * @returns The number of distinct left edges among the narrow (non-spanning) fields.
 */
function countFieldColumns(column: Element): number {
  const fields = [...column.querySelectorAll('dl > div')].filter((field) => !field.className.includes('col-span-full'));
  return new Set(fields.map((field) => Math.round(field.getBoundingClientRect().left))).size;
}

/** The measured parts of one case's card. */
interface DetailCardParts {
  readonly column: Element;
  readonly cover: Element;
  readonly body: Element;
  readonly pill: Element;
}

/**
 * Finds one case's column, cover frame, body column and pill.
 *
 * @param width The case's column width, which keys its column.
 * @returns The parts, or undefined when any of them did not render.
 */
function findCaseParts(width: number): DetailCardParts | undefined {
  const scope = `[data-anime-detail-fixture="${width}"]`;
  const cover = `${scope} .aspect-\\[5\\/7\\]`;
  const [column, coverNode, body, pill] = [scope, cover, `${cover} + *`, `${cover} [aria-hidden="true"]`]
    .map((selector) => document.querySelector(selector));
  // Narrowed by the `includes(null)` guard, which TypeScript cannot follow through the array.
  return [column, coverNode, body, pill].includes(null)
    ? undefined
    : { column: column as Element, cover: coverNode as Element, body: body as Element, pill: pill as Element };
}

/**
 * Checks that the full-size cover keeps its 5:7 minimum and stretches to the body.
 *
 * @param name The case's check prefix.
 * @param parts The case's measured parts.
 * @returns The stretch check.
 */
function checkCoverStretch(name: string, parts: DetailCardParts): Check {
  const cover = parts.cover.getBoundingClientRect();
  const bodyHeight = parts.body.getBoundingClientRect().height;
  const keepsRatio = cover.height >= (cover.width * 7) / 5 - TOLERANCE_PX;
  return {
    name: `${name}: cover keeps 5:7 and stretches to the body`,
    ok: keepsRatio && cover.height >= bodyHeight - TOLERANCE_PX,
    detail: `cover ${cover.height.toFixed(1)}px, body ${bodyHeight.toFixed(1)}px`,
  };
}

/**
 * Measures one width against the layout it must produce.
 *
 * @param testCase The width and its expected layout.
 * @returns The checks for that width.
 */
function measureCase(testCase: DetailCardCase): readonly Check[] {
  const name = `anime-detail ${testCase.width}px`;
  const parts = findCaseParts(testCase.width);
  if (parts === undefined) {
    return [{ name: `${name}: the card rendered its cover, body and pill`, ok: false, detail: 'part absent' }];
  }
  const coverWidth = parts.cover.getBoundingClientRect().width;
  const columnRight = parts.column.getBoundingClientRect().right;
  const widest = Math.max(...[...parts.column.querySelectorAll('*')].map((node) => node.getBoundingClientRect().right));
  const pillShown = getComputedStyle(parts.pill).display !== 'none';
  const fieldColumns = countFieldColumns(parts.column);
  const checks: Check[] = [
    { name: `${name}: cover is ${testCase.coverWidth}px wide`, ok: Math.abs(coverWidth - testCase.coverWidth) <= TOLERANCE_PX, detail: `${coverWidth.toFixed(1)}px` },
    { name: `${name}: General data uses ${testCase.fieldColumns} column(s)`, ok: fieldColumns === testCase.fieldColumns, detail: `${fieldColumns} columns` },
    { name: `${name}: the "No cover" pill matches its size`, ok: pillShown === testCase.showsPill, detail: `shown=${pillShown}, expected=${testCase.showsPill}` },
    { name: `${name}: no box grows past the column`, ok: widest <= columnRight + TOLERANCE_PX, detail: `widest ${Math.round(widest)}px, column ${Math.round(columnRight)}px` },
  ];
  return testCase.stretchesCover ? [...checks, checkCoverStretch(name, parts)] : checks;
}

/** The main card at its three layouts, measured once every case mounted. */
export function AnimeDetailCardFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => measureWhenReady(
    () => document.querySelectorAll('[data-anime-detail-fixture] .aspect-\\[5\\/7\\] img').length === CASES.length,
    () => setChecks([...CASES.flatMap(measureCase), checkThePage('anime-detail')]),
  ), []);

  return (
    <>
      {CASES.map((testCase) => (
        <div data-anime-detail-fixture={testCase.width} key={testCase.width} style={{ width: `${testCase.width}px` }}>
          <AnimeDetailMainCard
            cover={{ status: 'placeholder' }}
            detail={toAnimeDetailViewModel(HOSTILE_DETAIL)}
            isMutating={false}
            onBack={() => undefined}
            onCopyFolder={() => Promise.resolve()}
            onEditAnime={() => undefined}
            onOpenPage={() => Promise.resolve()}
            onPortadaError={() => undefined}
            onPortadaLoad={() => undefined}
            onRequestRepeat={() => undefined}
            onRequestRestore={() => undefined}
          />
        </div>
      ))}
      <VerdictReport checks={checks} />
    </>
  );
}
