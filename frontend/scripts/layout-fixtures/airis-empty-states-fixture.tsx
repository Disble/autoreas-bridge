import { useEffect, useState } from 'react';
import catalogArtwork from '../../src/assets/airis-empty-states/catalog.webp';
import editorLibraryArtwork from '../../src/assets/airis-empty-states/editor-library.webp';
import seasonArtwork from '../../src/assets/airis-empty-states/season.webp';
import todayArtwork from '../../src/assets/airis-empty-states/today.webp';
import { ANIME_EDITOR_EMPTY_STATE_COPY } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/anime-editor-workspace.constants';
import { EPISODE_ADD_LABEL, EPISODE_DURATIONS_EMPTY_COPY } from '../../src/features/anime-editor/ui/EpisodeDurationsSection/episode-durations-section.constants';
import { CATALOG_PANEL_EMPTY_STATE_COPY } from '../../src/features/catalog/ui/CatalogPanel/catalog-panel.constants';
import {
  EVALUATION_EMPTY_ACTION_LABEL,
  EVALUATION_EMPTY_DESCRIPTION,
  EVALUATION_EMPTY_TITLE,
} from '../../src/features/season/ui/EvaluationPanel/evaluation-panel.constants';
import { AirisEmptyState } from '../../src/shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CREATE_ANIME_LABEL } from '../../src/shared/ui/AirisEmptyState/airis-empty-state.constants';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Airis empty-state shell (docs/design/patterns/empty-states.md).
 *
 * The suite renders these in jsdom, which has no layout engine, no image
 * decoder and no container queries: there, `width={512}` is an attribute nobody
 * ever measures, a missing or corrupt WebP still "renders", and every `@xs:`
 * class is just a string. This page mounts the production shell with the
 * production copy and the real asset bytes in headless Edge, then measures
 * what the browser actually decoded and laid out.
 *
 * The artwork size follows the CONTAINER, so each placement pins a container
 * width and states the size and geometry that width must produce. One verdict
 * per placement, because a per-geometry defect needs to name its geometry.
 */

/** How far outside its card an image may sit before it counts as escaping. */
const CARD_BOUNDS_TOLERANCE_PX = 1;

/** The intrinsic size every Airis composition is authored and specified at. */
const EXPECTED_INTRINSIC_SIZE = 512;

/** How far the rendered artwork may drift from its specified display size. */
const ARTWORK_SIZE_TOLERANCE_PX = 1;

/** How far the rendered box may drift from square before the art is distorted. */
const ASPECT_TOLERANCE_PX = 1;

/** How far the stacked heading's left edge may drift from the artwork's. */
const AXIS_TOLERANCE_PX = 1;

/** Artwork on a wide container (`@xl`, 36rem and up). */
const WIDE_ARTWORK_PX = 144;

/** The waiting pose on a wide container: one step smaller, so it reads as a pause, not a welcome. */
const WAITING_WIDE_ARTWORK_PX = 120;

/** Artwork beside the copy on a medium container (`@xs` to `@xl`). */
const MEDIUM_ARTWORK_PX = 104;

/** Artwork stacked over the copy in a narrow rail (below `@xs`). */
const NARROW_ARTWORK_PX = 88;

/**
 * The tallest a side-by-side block may grow. It exists to be short and wide;
 * a block that grows into a tall column has lost the point of the layout, and
 * the first build of the old stacked card pushed its own button below the fold.
 */
const MAX_SPLIT_HEIGHT_PX = 240;

/** The same budget for a narrow rail, where the copy legitimately stacks and wraps. */
const MAX_STACKED_HEIGHT_PX = 480;

/** The Editor Library rail's column width, the narrowest container any Airis state renders in. */
const RAIL_CONTAINER_WIDTH_PX = 320;

/** The Editor form column the Episodes section sits in, narrower than the page. */
const SECTION_CONTAINER_WIDTH_PX = 560;

/** One composition under measurement: its subject name, artwork, and copy. */
interface AirisComposition {
  readonly subject: string;
  readonly imageSrc: string;
  readonly title: string;
  readonly description: string;
  /** The recovery action's label; the create-anime action when omitted. */
  readonly actionLabel?: string;
  /** The mascot kind; `first-run` when omitted. */
  readonly kind?: 'waiting-on-step';
}

/** One measured placement: a composition rendered at one container width. */
interface AirisPlacement {
  readonly composition: AirisComposition;
  readonly subject: string;
  /** Undefined means the full page width; a number pins a narrow container. */
  readonly widthPx?: number;
  /** The shell placement under measurement; undefined is its own card. */
  readonly size?: 'section';
  /** Whether the copy must sit beside the artwork or under it at this width. */
  readonly geometry: 'split' | 'stacked';
  /** The artwork display size this container width must produce. */
  readonly artworkPx: number;
  /** The height budget for this geometry. */
  readonly maxHeightPx: number;
}

/** Every scoped surface's real artwork and real production copy. */
const COMPOSITIONS: readonly AirisComposition[] = [
  {
    subject: 'today',
    imageSrc: todayArtwork,
    title: 'Nothing scheduled for Friday',
    description: 'No active anime are scheduled for Friday. Create one to put it on your schedule.',
  },
  {
    subject: 'editor-library',
    imageSrc: editorLibraryArtwork,
    title: ANIME_EDITOR_EMPTY_STATE_COPY.actual.title,
    description: ANIME_EDITOR_EMPTY_STATE_COPY.actual.description,
  },
  {
    subject: 'catalog',
    imageSrc: catalogArtwork,
    title: CATALOG_PANEL_EMPTY_STATE_COPY.actual.title,
    description: CATALOG_PANEL_EMPTY_STATE_COPY.actual.description,
  },
];

/** The Editor Episodes section's empty state, the reference user of the `section` placement. */
const EPISODES_COMPOSITION: AirisComposition = {
  subject: 'editor-episodes section',
  imageSrc: editorLibraryArtwork,
  title: EPISODE_DURATIONS_EMPTY_COPY.none.title,
  description: EPISODE_DURATIONS_EMPTY_COPY.none.description,
  actionLabel: EPISODE_ADD_LABEL,
};

/** Season Evaluation's empty state, the reference user of the `waiting-on-step` mascot. */
const EVALUATION_COMPOSITION: AirisComposition = {
  subject: 'evaluation waiting',
  imageSrc: seasonArtwork,
  title: EVALUATION_EMPTY_TITLE,
  description: EVALUATION_EMPTY_DESCRIPTION,
  actionLabel: EVALUATION_EMPTY_ACTION_LABEL,
  kind: 'waiting-on-step',
};

/**
 * Reads back what the browser decoded and laid out for one placement.
 *
 * Measures the box rather than asserting the attribute: `width={512}` on an
 * `<img>` whose source never decoded still reports 512 as an attribute, and
 * `naturalWidth` is the only value that proves real bytes arrived.
 *
 * @param root The wrapper holding exactly one rendered empty state.
 * @param placement The placement and the geometry it must produce.
 * @returns Every check this placement must pass.
 */
function measurePlacement(root: HTMLElement | null, placement: AirisPlacement): readonly Check[] {
  const { subject } = placement;
  const card = queryCard(root);
  const image = queryImage(root);
  const heading = queryHeading(root);

  if (card === null || image === null || heading === null) {
    return [{ name: `${subject}: the empty state rendered its shell, artwork and heading`, ok: false, detail: describePresence(card, image, heading) }];
  }

  const imageBox = image.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();

  return [
    checkTheDecode(image, subject),
    ...checkTheBox(imageBox, cardBox, subject),
    ...checkTheSize(imageBox, placement),
    checkTheGeometry(imageBox, heading.getBoundingClientRect(), placement),
    {
      name: `${subject}: the empty state stays a hint rather than a page`,
      ok: cardBox.height <= placement.maxHeightPx,
      detail: `shell ${Math.round(cardBox.height)}px tall, cap ${placement.maxHeightPx}px`,
    },
    checkThePage(subject),
  ];
}

/**
 * Whether the container produced the artwork size its width calls for. A
 * container query that never matched leaves the narrow size on a wide page;
 * one that matched too early puts a 144px mascot in a rail.
 */
function checkTheSize(imageBox: DOMRect, placement: AirisPlacement): readonly Check[] {
  const { artworkPx, subject } = placement;
  return [
    {
      name: `${subject}: the artwork renders at ${artworkPx}px for this container`,
      ok: Math.abs(imageBox.width - artworkPx) <= ARTWORK_SIZE_TOLERANCE_PX,
      detail: `${Math.round(imageBox.width)}px wide`,
    },
    {
      name: `${subject}: the artwork keeps its square aspect`,
      ok: Math.abs(imageBox.width - imageBox.height) <= ASPECT_TOLERANCE_PX,
      detail: `${Math.round(imageBox.width)}x${Math.round(imageBox.height)}`,
    },
  ];
}

/** The geometry check this placement's container width calls for. */
function checkTheGeometry(imageBox: DOMRect, headingBox: DOMRect, placement: AirisPlacement): Check {
  const check = placement.geometry === 'split' ? checkTheCopyBeside : checkTheCopyUnderOnOneAxis;
  return check(imageBox, headingBox, placement.subject);
}

/** Whether the copy sits beside the artwork rather than under it. */
function checkTheCopyBeside(imageBox: DOMRect, headingBox: DOMRect, subject: string): Check {
  return {
    name: `${subject}: the copy sits beside the artwork, not under it`,
    ok: headingBox.left >= imageBox.right && headingBox.top < imageBox.bottom,
    detail: `heading at ${Math.round(headingBox.left)},${Math.round(headingBox.top)}; image right ${Math.round(imageBox.right)}, bottom ${Math.round(imageBox.bottom)}`,
  };
}

/**
 * Whether the stacked copy sits under the artwork AND on the same left edge.
 * The old shell centered the artwork over a left-aligned text block, two axes
 * in one block; the stacked fallback keeps one.
 */
function checkTheCopyUnderOnOneAxis(imageBox: DOMRect, headingBox: DOMRect, subject: string): Check {
  return {
    name: `${subject}: the copy sits under the artwork on the same left edge`,
    ok: headingBox.top >= imageBox.bottom && Math.abs(headingBox.left - imageBox.left) <= AXIS_TOLERANCE_PX,
    detail: `heading at ${Math.round(headingBox.left)},${Math.round(headingBox.top)}; image left ${Math.round(imageBox.left)}, bottom ${Math.round(imageBox.bottom)}`,
  };
}

/** The shell the empty state renders as its root, or null when it never mounted. */
function queryCard(root: HTMLElement | null): Element | null {
  return root === null ? null : root.firstElementChild;
}

/** The decorative artwork inside the empty state, or null when it never mounted. */
function queryImage(root: HTMLElement | null): HTMLImageElement | null {
  return root === null ? null : root.querySelector('img');
}

/** The empty state's heading, or null when it never mounted. */
function queryHeading(root: HTMLElement | null): HTMLHeadingElement | null {
  return root === null ? null : root.querySelector('h3');
}

/** Whether the artwork has finished decoding and therefore has a size to measure. */
function hasDecodedImage(root: HTMLElement | null): boolean {
  const image = queryImage(root);
  return image !== null && image.complete && image.naturalWidth > 0;
}

/** Names which part is missing, since "it did not mount" is a dead end to debug. */
function describePresence(card: Element | null, image: HTMLImageElement | null, heading: Element | null): string {
  return `shell ${presence(card)}, image ${presence(image)}, heading ${presence(heading)}`;
}

/** One word for whether a queried node was found. */
function presence(node: Element | null): string {
  return node === null ? 'absent' : 'present';
}

/** Whether real image bytes arrived, read from the decoder rather than the markup. */
function checkTheDecode(image: HTMLImageElement, subject: string): Check {
  return {
    name: `${subject}: the artwork decoded at its authored 512px`,
    ok: image.naturalWidth === EXPECTED_INTRINSIC_SIZE && image.naturalHeight === EXPECTED_INTRINSIC_SIZE,
    detail: `natural ${image.naturalWidth}x${image.naturalHeight}`,
  };
}

/** Where the decoded artwork actually landed: on screen at all, and within its shell. */
function checkTheBox(imageBox: DOMRect, cardBox: DOMRect, subject: string): readonly Check[] {
  return [
    {
      name: `${subject}: the artwork occupies a visible box`,
      ok: imageBox.width > 0 && imageBox.height > 0,
      detail: `box ${Math.round(imageBox.width)}x${Math.round(imageBox.height)}`,
    },
    {
      name: `${subject}: the artwork stays inside its shell`,
      ok: isInside(imageBox, cardBox),
      detail: `image ${Math.round(imageBox.left)}..${Math.round(imageBox.right)}, shell ${Math.round(cardBox.left)}..${Math.round(cardBox.right)}`,
    },
  ];
}

/** Whether one box sits within another on every edge, within the shared tolerance. */
function isInside(inner: DOMRect, outer: DOMRect): boolean {
  return inner.left >= outer.left - CARD_BOUNDS_TOLERANCE_PX
    && inner.right <= outer.right + CARD_BOUNDS_TOLERANCE_PX
    && inner.top >= outer.top - CARD_BOUNDS_TOLERANCE_PX
    && inner.bottom <= outer.bottom + CARD_BOUNDS_TOLERANCE_PX;
}

/**
 * Mounts one production empty state and measures it once its artwork decoded.
 *
 * Waits on `complete` plus a non-zero `naturalWidth` rather than one frame: the
 * WebP decode is a separate step from the mount, and measuring in between reads
 * an image that has no intrinsic size yet.
 *
 * @param placement The composition, container width and expected geometry.
 * @returns The mounted empty state with its own verdict node.
 */
function PlacementFixture({ placement }: Readonly<{ placement: AirisPlacement }>) {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();
  const { composition, subject, widthPx, size } = placement;

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-airis-fixture="${subject}"]`);

    return measureWhenReady(
      () => hasDecodedImage(root),
      () => setChecks(measurePlacement(root, placement)),
    );
  }, [placement, subject]);

  return (
    <>
      <div data-airis-fixture={subject} style={widthPx === undefined ? undefined : { width: `${widthPx}px` }}>
        <AirisEmptyState
          action={{ label: composition.actionLabel ?? AIRIS_CREATE_ANIME_LABEL, onPress: () => undefined }}
          description={composition.description}
          imageSrc={composition.imageSrc}
          kind={composition.kind}
          size={size}
          title={composition.title}
        />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}

/**
 * Every card composition twice: at full width, as Today and Catalog render it
 * (split, wide artwork), and in the Editor rail's narrow column (stacked on one
 * axis). Both matter: a size that only works on a wide page still overflows
 * the rail, and a rail that fits proves nothing about the wide panel.
 */
const CARD_PLACEMENTS: readonly AirisPlacement[] = COMPOSITIONS.flatMap((composition) => [
  { composition, subject: composition.subject, geometry: 'split' as const, artworkPx: WIDE_ARTWORK_PX, maxHeightPx: MAX_SPLIT_HEIGHT_PX },
  {
    composition,
    subject: `${composition.subject} in a rail`,
    widthPx: RAIL_CONTAINER_WIDTH_PX,
    geometry: 'stacked' as const,
    artworkPx: NARROW_ARTWORK_PX,
    maxHeightPx: MAX_STACKED_HEIGHT_PX,
  },
]);

/**
 * The section placement at full width and in the Editor form's column: the
 * copy stays beside the mascot in both, and the artwork shrinks with the column.
 */
const SECTION_PLACEMENTS: readonly AirisPlacement[] = [
  { composition: EPISODES_COMPOSITION, subject: EPISODES_COMPOSITION.subject, size: 'section', geometry: 'split', artworkPx: WIDE_ARTWORK_PX, maxHeightPx: MAX_SPLIT_HEIGHT_PX },
  {
    composition: EPISODES_COMPOSITION,
    subject: `${EPISODES_COMPOSITION.subject} in the form column`,
    widthPx: SECTION_CONTAINER_WIDTH_PX,
    size: 'section',
    geometry: 'split',
    artworkPx: MEDIUM_ARTWORK_PX,
    maxHeightPx: MAX_SPLIT_HEIGHT_PX,
  },
];

/**
 * The waiting pose at full width, where it must stop one step short of the
 * first-run size, and in a rail, where both kinds share the narrow size.
 */
const WAITING_PLACEMENTS: readonly AirisPlacement[] = [
  { composition: EVALUATION_COMPOSITION, subject: EVALUATION_COMPOSITION.subject, geometry: 'split', artworkPx: WAITING_WIDE_ARTWORK_PX, maxHeightPx: MAX_SPLIT_HEIGHT_PX },
  {
    composition: EVALUATION_COMPOSITION,
    subject: `${EVALUATION_COMPOSITION.subject} in a rail`,
    widthPx: RAIL_CONTAINER_WIDTH_PX,
    geometry: 'stacked',
    artworkPx: NARROW_ARTWORK_PX,
    maxHeightPx: MAX_STACKED_HEIGHT_PX,
  },
];

/** Every Airis placement on the shared fixture page, measured independently. */
export function AirisEmptyStatesFixture() {
  return (
    <>
      {[...CARD_PLACEMENTS, ...SECTION_PLACEMENTS, ...WAITING_PLACEMENTS].map((placement) => (
        <PlacementFixture key={placement.subject} placement={placement} />
      ))}
    </>
  );
}
