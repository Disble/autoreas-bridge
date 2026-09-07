import { useEffect, useState } from 'react';
import catalogArtwork from '../../src/assets/airis-empty-states/catalog.webp';
import editorLibraryArtwork from '../../src/assets/airis-empty-states/editor-library.webp';
import todayArtwork from '../../src/assets/airis-empty-states/today.webp';
import { ANIME_EDITOR_EMPTY_STATE_COPY } from '../../src/features/anime-editor/ui/AnimeEditorWorkspace/anime-editor-workspace.constants';
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

/** One composition under measurement: its subject name, artwork, and copy. */
interface AirisComposition {
  readonly subject: string;
  readonly imageSrc: string;
  readonly title: string;
  readonly description: string;
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
function measureComposition(root: HTMLElement | null, subject: string): readonly Check[] {
  const card = queryCard(root);
  const image = queryImage(root);

  if (card === null || image === null) {
    return [{ name: `${subject}: the empty state rendered its card and artwork`, ok: false, detail: describePresence(card, image) }];
  }

  return [
    checkTheDecode(image, subject),
    ...checkTheBox(image.getBoundingClientRect(), card.getBoundingClientRect(), subject),
    checkThePage(subject),
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
function CompositionFixture({ composition }: Readonly<{ composition: AirisComposition }>) {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(`[data-airis-fixture="${composition.subject}"]`);

    return measureWhenReady(
      () => hasDecodedImage(root),
      () => setChecks(measureComposition(root, composition.subject)),
    );
  }, [composition.subject]);

  return (
    <>
      <div data-airis-fixture={composition.subject}>
        <AirisEmptyState
          action={{ label: AIRIS_CREATE_ANIME_LABEL, onPress: () => undefined }}
          description={composition.description}
          imageSrc={composition.imageSrc}
          title={composition.title}
        />
      </div>
      <VerdictReport checks={checks} />
    </>
  );
}

/** Every Airis composition on the shared fixture page, measured independently. */
export function AirisEmptyStatesFixture() {
  return (
    <>
      {COMPOSITIONS.map((composition) => (
        <CompositionFixture composition={composition} key={composition.subject} />
      ))}
    </>
  );
}
