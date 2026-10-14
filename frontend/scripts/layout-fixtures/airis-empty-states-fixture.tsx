import { useEffect, useState } from 'react';
import catalogArtwork from '../../src/assets/airis-empty-states/catalog.webp';
import editorLibraryArtwork from '../../src/assets/airis-empty-states/editor-library.webp';
import todayArtwork from '../../src/assets/airis-empty-states/today.webp';
import { ANIME_EDITOR_EMPTY_STATE_COPY } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/anime-editor-workspace.constants';
import { EPISODE_ADD_LABEL, EPISODE_DURATIONS_EMPTY_COPY } from '../../src/features/anime-editor/ui/EpisodeDurationsSection/episode-durations-section.constants';
import { CATALOG_PANEL_EMPTY_STATE_COPY } from '../../src/features/catalog/ui/CatalogPanel/catalog-panel.constants';
import { AirisEmptyState } from '../../src/shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CREATE_ANIME_LABEL } from '../../src/shared/ui/AirisEmptyState/airis-empty-state.constants';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the three Airis empty-state compositions.
 *
 * The suite renders these in jsdom, which has no layout engine and no image
 * decoder: there, `width={512}` is an attribute nobody ever measures and a
 * missing or corrupt WebP still "renders". This page mounts the production
 * shell with the production copy and the real asset bytes in headless Edge,
 * then measures what the browser actually decoded and laid out.
 *
 * One verdict per composition, because an asset that fails to decode is a
 * per-asset defect and a shared verdict would name the wrong one.
 */

/** How far outside its card an image may sit before it counts as escaping. */
const CARD_BOUNDS_TOLERANCE_PX = 1;

/** The intrinsic size every Airis composition is authored and specified at. */
const EXPECTED_INTRINSIC_SIZE = 512;

/**
 * The widest the artwork may actually render.
 *
 * The assets are authored at 512 so they stay sharp on a high-DPI panel; that
 * is a source size, not a display size. Without this cap the browser renders
 * the source size, which is what shipped: a 512px illustration filling the
 * Today panel and pushing its own recovery button below the fold.
 */
const MAX_ARTWORK_DISPLAY_PX = 200;

/** The tallest an empty state may grow, on a page wide enough not to wrap. */
const MAX_CARD_HEIGHT_PX = 420;

/**
 * The same budget for a narrow column, where the copy legitimately wraps onto
 * more lines. Stated separately rather than by raising the wide cap: a single
 * number loose enough for the rail would let the full-width card regain most of
 * the height this fixture exists to keep off it.
 */
const MAX_RAIL_CARD_HEIGHT_PX = 480;

/** The share of its card the artwork may occupy before it crowds out the copy. */
const MAX_ARTWORK_CARD_SHARE = 0.6;

/** How far the rendered box may drift from square before the art is distorted. */
const ASPECT_TOLERANCE_PX = 1;

/**
 * The Editor Library rail's column width, the narrowest container any Airis
 * state renders in. The first version of this fixture only ever measured a
 * full-width page, so nothing proved the artwork fitted the rail at all.
 */
const RAIL_CONTAINER_WIDTH_PX = 320;

/** The inline artwork's specified display size: 128px beside the copy. */
const INLINE_ARTWORK_PX = 128;

/** How far the inline artwork may drift from its specified size. */
const INLINE_ARTWORK_TOLERANCE_PX = 1;

/**
 * The tallest the inline block may grow. It exists to be short and wide, in
 * proportion with a section's table and alert; a block that wraps into a tall
 * column has lost the point of the layout.
 */
const MAX_INLINE_HEIGHT_PX = 200;

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
    title: CATALOG_PANEL_EMPTY_STATE_COPY.criteria.title,
    description: CATALOG_PANEL_EMPTY_STATE_COPY.criteria.description,
  },
];

/**
 * Reads back what the browser decoded and laid out for one composition.
 *
 * Measures the box rather than asserting the attribute: `width={512}` on an
 * `<img>` whose source never decoded still reports 512 as an attribute, and
 * `naturalWidth` is the only value that proves real bytes arrived.
 *
 * @param root The wrapper holding exactly one rendered empty state.
 * @param subject Which composition is being measured, for the report.
 * @returns Every check this composition must pass.
 */
function measureComposition(root: HTMLElement | null, subject: string, maxCardHeightPx: number, size: AirisPlacement['size']): readonly Check[] {
  const card = queryCard(root);
  const image = queryImage(root);

  if (card === null || image === null) {
    return [{ name: `${subject}: the empty state rendered its card and artwork`, ok: false, detail: describePresence(card, image) }];
  }

  const imageBox = image.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();

  return [
    checkTheDecode(image, subject),
    ...checkTheBox(imageBox, cardBox, subject),
    ...(size === 'inline' ? checkTheInlineLayout(imageBox, cardBox, root, subject) : checkTheScale(imageBox, cardBox, subject, maxCardHeightPx)),
    checkThePage(subject),
  ];
}

/** The inline block's heading box, or nothing when the block rendered no heading. */
function headingBoxOf(root: HTMLElement | null): DOMRect | null {
  const heading = root === null ? null : root.querySelector('h3');
  return heading === null ? null : heading.getBoundingClientRect();
}

/** Whether the inline block's copy sits beside the artwork rather than under it. */
function checkTheCopyBesideTheArtwork(imageBox: DOMRect, root: HTMLElement | null, subject: string): Check {
  const name = `${subject}: the copy sits beside the artwork, not under it`;
  const headingBox = headingBoxOf(root);
  if (headingBox === null) return { name, ok: false, detail: 'heading absent' };
  return {
    name,
    ok: headingBox.left >= imageBox.right && headingBox.top < imageBox.bottom,
    detail: `heading at ${Math.round(headingBox.left)},${Math.round(headingBox.top)}; image right ${Math.round(imageBox.right)}, bottom ${Math.round(imageBox.bottom)}`,
  };
}

/**
 * The side-by-side layout's own proportions: the mascot at 128px on the left,
 * the copy beside it rather than under it, and a block that stays short.
 * The stacked layout's artwork-share rule does not apply: in a short, wide
 * block the artwork is most of the height by design.
 */
function checkTheInlineLayout(imageBox: DOMRect, cardBox: DOMRect, root: HTMLElement | null, subject: string): readonly Check[] {
  return [
    {
      name: `${subject}: the artwork renders at 128px`,
      ok: Math.abs(imageBox.width - INLINE_ARTWORK_PX) <= INLINE_ARTWORK_TOLERANCE_PX,
      detail: `${Math.round(imageBox.width)}px wide`,
    },
    {
      name: `${subject}: the artwork keeps its square aspect`,
      ok: Math.abs(imageBox.width - imageBox.height) <= ASPECT_TOLERANCE_PX,
      detail: `${Math.round(imageBox.width)}x${Math.round(imageBox.height)}`,
    },
    checkTheCopyBesideTheArtwork(imageBox, root, subject),
    {
      name: `${subject}: the inline block stays short`,
      ok: cardBox.height <= MAX_INLINE_HEIGHT_PX,
      detail: `block ${Math.round(cardBox.height)}px tall, cap ${MAX_INLINE_HEIGHT_PX}px`,
    },
  ];
}

/**
 * Whether the artwork is a hint or a wall.
 *
 * This is the check the first version of this fixture lacked, and the gap is
 * worth naming: it measured that the image was present, that it had a non-zero
 * box, and that it sat inside its card — all three of which a 512px
 * illustration filling the entire panel satisfies. It shipped exactly that, and
 * the recovery button landed below the fold on an ordinary window.
 *
 * Presence and containment are not proportion. These four measure proportion.
 */
function checkTheScale(imageBox: DOMRect, cardBox: DOMRect, subject: string, maxCardHeightPx: number): readonly Check[] {
  return [
    {
      name: `${subject}: the artwork renders at a display size, not its authored 512px`,
      ok: imageBox.width <= MAX_ARTWORK_DISPLAY_PX,
      detail: `${Math.round(imageBox.width)}px wide, cap ${MAX_ARTWORK_DISPLAY_PX}px`,
    },
    {
      name: `${subject}: the artwork keeps its square aspect`,
      ok: Math.abs(imageBox.width - imageBox.height) <= ASPECT_TOLERANCE_PX,
      detail: `${Math.round(imageBox.width)}x${Math.round(imageBox.height)}`,
    },
    {
      name: `${subject}: the artwork leaves the copy and the action their room`,
      ok: imageBox.height <= cardBox.height * MAX_ARTWORK_CARD_SHARE,
      detail: `image ${Math.round(imageBox.height)}px of a ${Math.round(cardBox.height)}px card`,
    },
    {
      name: `${subject}: the empty state stays a hint rather than a page`,
      ok: cardBox.height <= maxCardHeightPx,
      detail: `card ${Math.round(cardBox.height)}px tall, cap ${maxCardHeightPx}px`,
    },
  ];
}

/** The card the empty state renders as its root, or null when it never mounted. */
function queryCard(root: HTMLElement | null): Element | null {
  return root === null ? null : root.firstElementChild;
}

/** The decorative artwork inside the empty state, or null when it never mounted. */
function queryImage(root: HTMLElement | null): HTMLImageElement | null {
  return root === null ? null : root.querySelector('img');
}

/** Whether the artwork has finished decoding and therefore has a size to measure. */
function hasDecodedImage(root: HTMLElement | null): boolean {
  const image = queryImage(root);
  return image !== null && image.complete && image.naturalWidth > 0;
}

/** Names which half is missing, since "it did not mount" is a dead end to debug. */
function describePresence(card: Element | null, image: HTMLImageElement | null): string {
  return `card ${presence(card)}, image ${presence(image)}`;
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

/** Where the decoded artwork actually landed: on screen at all, and within its card. */
function checkTheBox(imageBox: DOMRect, cardBox: DOMRect, subject: string): readonly Check[] {
  return [
    {
      name: `${subject}: the artwork occupies a visible box`,
      ok: imageBox.width > 0 && imageBox.height > 0,
      detail: `box ${Math.round(imageBox.width)}x${Math.round(imageBox.height)}`,
    },
    {
      name: `${subject}: the artwork stays inside its card`,
      ok: isInside(imageBox, cardBox),
      detail: `image ${Math.round(imageBox.left)}..${Math.round(imageBox.right)}, card ${Math.round(cardBox.left)}..${Math.round(cardBox.right)}`,
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
 * @param composition The surface's artwork and copy under measurement.
 * @returns The mounted empty state with its own verdict node.
 */
function CompositionFixture({ placement }: Readonly<{ placement: AirisPlacement }>) {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();
  const { composition, subject, widthPx, maxCardHeightPx, size } = placement;

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-airis-fixture="${subject}"]`);

    return measureWhenReady(
      () => hasDecodedImage(root),
      () => setChecks(measureComposition(root, subject, maxCardHeightPx, size)),
    );
  }, [maxCardHeightPx, size, subject]);

  return (
    <>
      <div data-airis-fixture={subject} style={widthPx === undefined ? undefined : { width: `${widthPx}px` }}>
        <AirisEmptyState
          action={{ label: composition.actionLabel ?? AIRIS_CREATE_ANIME_LABEL, onPress: () => undefined }}
          description={composition.description}
          imageSrc={composition.imageSrc}
          size={size}
          title={composition.title}
        />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}

/** One measured placement: a composition rendered at one container width. */
interface AirisPlacement {
  readonly composition: AirisComposition;
  readonly subject: string;
  /** Undefined means the full page width; a number pins a narrow container. */
  readonly widthPx?: number;
  /** The height budget for this geometry — a wrapping column earns more room. */
  readonly maxCardHeightPx: number;
  /** The `AirisEmptyState` size under measurement; undefined is the stacked default. */
  readonly size?: 'inline';
}

/** The Editor Episodes section's empty state, the first user of the side-by-side size. */
const EPISODES_COMPOSITION: AirisComposition = {
  subject: 'editor-episodes inline',
  imageSrc: editorLibraryArtwork,
  title: EPISODE_DURATIONS_EMPTY_COPY.none.title,
  description: EPISODE_DURATIONS_EMPTY_COPY.none.description,
  actionLabel: EPISODE_ADD_LABEL,
};

/**
 * The inline size at full width and in the Editor form's column: the copy must
 * stay beside the mascot in both, and the block must stay short.
 */
const INLINE_PLACEMENTS: readonly AirisPlacement[] = [
  { composition: EPISODES_COMPOSITION, subject: EPISODES_COMPOSITION.subject, maxCardHeightPx: MAX_INLINE_HEIGHT_PX, size: 'inline' },
  { composition: EPISODES_COMPOSITION, subject: `${EPISODES_COMPOSITION.subject} in a section`, widthPx: SECTION_CONTAINER_WIDTH_PX, maxCardHeightPx: MAX_INLINE_HEIGHT_PX, size: 'inline' },
];

/**
 * Every composition twice: once at full width, as Today and Catalog render it,
 * and once in the Editor rail's narrow column. Both matter — a cap that only
 * works on a wide page still overflows the rail, and a rail that fits proves
 * nothing about the panel that pushed its own button off screen.
 */
const PLACEMENTS: readonly AirisPlacement[] = COMPOSITIONS.flatMap((composition) => [
  { composition, subject: composition.subject, maxCardHeightPx: MAX_CARD_HEIGHT_PX },
  { composition, subject: `${composition.subject} in a rail`, widthPx: RAIL_CONTAINER_WIDTH_PX, maxCardHeightPx: MAX_RAIL_CARD_HEIGHT_PX },
]);

/** Every Airis placement on the shared fixture page, measured independently. */
export function AirisEmptyStatesFixture() {
  return (
    <>
      {[...PLACEMENTS, ...INLINE_PLACEMENTS].map((placement) => (
        <CompositionFixture key={placement.subject} placement={placement} />
      ))}
    </>
  );
}
