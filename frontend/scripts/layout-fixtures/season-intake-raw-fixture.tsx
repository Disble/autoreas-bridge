import { Card } from '@heroui/react';
import { useEffect, useState } from 'react';
import { IntakePanelBody } from '../../src/features/season/ui/IntakePanel/IntakePanelBody';
import { INTAKE_PASTE_PLACEHOLDER } from '../../src/features/season/ui/IntakePanel/intake-panel.constants';
import type { IntakePanelBodyProps } from '../../src/features/season/ui/IntakePanel/intake-panel.types';
import { measureWhenReady, VerdictReport, type Check } from './verdict';

/**
 * Layout fixture for the Season Intake panel's Raw textarea.
 *
 * It mounts the REAL `IntakePanelBody` in Raw mode inside a HeroUI card, so the
 * textarea sits on the surface it sits on in the app, and reads what the browser
 * computed. The reported defect was a textarea with no visible boundary: HeroUI's
 * `--field-border` is transparent, so the field read as bare text on the card.
 * jsdom has no cascade worth trusting and a class assertion only proves a string
 * is present, so the promise is checked as computed style: a dashed, non-zero
 * border whose colour meets WCAG non-text contrast against the field and the
 * card in BOTH themes, a resize handle that still exists, a focus indicator that
 * still appears, and a box that fits its column.
 */

/** The widths the field is measured at, named for the situation each stands for. */
const RAW_WIDTHS = [
  { name: 'narrow', px: 320 },
  { name: 'wide', px: 1200 },
] as const;

/**
 * The HeroUI themes the field is measured in. Each is applied as the `class` and
 * `data-theme` HeroUI's variables are scoped to, on the fixture's own wrapper, so
 * both render side by side and the page theme is never switched.
 */
const RAW_THEMES = ['dark', 'light'] as const;

/** Every theme at every width: one wrapper, one textarea, one set of checks each. */
const RAW_VARIANTS = RAW_THEMES.flatMap((theme) =>
  RAW_WIDTHS.map(({ name, px }) => ({ key: `${theme} ${name}`, theme, px })),
);

/** Attribute that marks each width wrapper so its textarea can be found. */
const WRAPPER_ATTRIBUTE = 'data-season-intake-raw-fixture';

/**
 * The least WCAG contrast ratio the composited border must have against the
 * field background and against the card behind it: the 3:1 WCAG 2.1 SC 1.4.11
 * sets for the visual information that identifies a control's boundary. The
 * unstyled field measures 1.00:1 on both (a transparent border).
 */
const MIN_BORDER_CONTRAST = 3;

/** How much a box may exceed its container before it counts as overflowing. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * The Raw-mode view model: every handler inert, every collection empty. Raw mode
 * reads only `mode`, `rawDraft` and `onRawChange`; the rest satisfies the type.
 */
const RAW_VIEW_MODEL: IntakePanelBodyProps = {
  mode: 'raw',
  readOnly: false,
  rawDraft: '',
  editableRows: [],
  errorMessage: undefined,
  selected: new Set(),
  folderOverrides: {},
  folderPreviews: {},
  metadataByRow: {},
  appliedMetadataByRow: {},
  metadataLookupSource: {
    SearchMyAnimeList: () => Promise.reject(new Error('inert fixture')),
    GetMyAnimeListDetail: () => Promise.reject(new Error('inert fixture')),
  },
  switchMode: () => undefined,
  onRawChange: () => undefined,
  toggleSelect: () => undefined,
  onPickFolder: () => undefined,
  onDiscard: () => undefined,
  onResolve: () => undefined,
  onOpenPage: () => undefined,
  onMetadataApplied: () => undefined,
  onMetadataUndo: () => undefined,
  onMetadataClear: () => undefined,
};

/** An opaque sRGB colour as 0-255 channels. */
type Rgb = readonly [number, number, number];

/**
 * Resolves any computed CSS colour to opaque sRGB by painting `layers` over each
 * other on a 1x1 canvas, bottom first. Computed colours can come back as
 * `oklab(...)` or `color-mix` results with alpha; the canvas is the browser's
 * own resolver for them.
 */
function compositeColors(layers: readonly string[]): Rgb {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return [0, 0, 0];
  }
  for (const layer of layers) {
    context.fillStyle = layer;
    context.fillRect(0, 0, 1, 1);
  }
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue];
}

/** WCAG relative luminance of an sRGB colour. */
function luminance([red, green, blue]: Rgb): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colours, always >= 1. */
function contrastRatio(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** Finds the textarea and card parts inside one wrapper, or null when Raw did not render. */
function findParts(wrapper: Element): { textarea: HTMLTextAreaElement; card: Element } | null {
  const textarea = wrapper.querySelector('textarea');
  const card = wrapper.firstElementChild;
  return textarea && card ? { textarea, card } : null;
}

/** The border promises: dashed on every side, visible width, and a colour you can see. */
function checkBorder(name: string, textarea: HTMLTextAreaElement, card: Element): readonly Check[] {
  const style = globalThis.getComputedStyle(textarea);
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const styles = sides.map((side) => style.getPropertyValue(`border-${side}-style`));
  const widths = sides.map((side) => Number.parseFloat(style.getPropertyValue(`border-${side}-width`)));
  const fieldBackground = compositeColors([globalThis.getComputedStyle(card).backgroundColor, style.backgroundColor]);
  const cardBackground = compositeColors([globalThis.getComputedStyle(card).backgroundColor]);
  const border = compositeColors([
    globalThis.getComputedStyle(card).backgroundColor,
    style.backgroundColor,
    style.borderTopColor,
  ]);
  const againstField = contrastRatio(border, fieldBackground);
  const againstCard = contrastRatio(border, cardBackground);

  return [
    {
      name: `${name}: the border is dashed on every side`,
      ok: styles.every((side) => side === 'dashed'),
      detail: `border-style ${styles.join('/')}`,
    },
    {
      name: `${name}: the border has a visible width`,
      ok: widths.every((width) => width >= 1),
      detail: `border-width ${widths.join('/')}px`,
    },
    {
      name: `${name}: the border colour stands apart from the field and the card`,
      ok: againstField >= MIN_BORDER_CONTRAST && againstCard >= MIN_BORDER_CONTRAST,
      detail: `border ${style.borderTopColor}, ${againstField.toFixed(2)}:1 on the field, ${againstCard.toFixed(2)}:1 on the card, minimum ${MIN_BORDER_CONTRAST}:1`,
    },
  ];
}

/** The text of the label the browser associates with the textarea, or a marker when it has none. */
function accessibleLabel(textarea: HTMLTextAreaElement): string {
  return textarea.labels?.[0]?.textContent ?? '(no label)';
}

/** What focusing the textarea did: whether it took focus, and its box-shadow before and after. */
interface FocusProbe {
  readonly focused: boolean;
  readonly restingShadow: string;
  readonly focusedShadow: string;
}

/**
 * Focuses the textarea, reads the ring it draws, and puts it back as found.
 * The ring fades in over 150ms; reading it mid-transition sees a transparent
 * shadow, so the transition is switched off for the read.
 */
function probeFocus(textarea: HTMLTextAreaElement): FocusProbe {
  textarea.style.transition = 'none';
  const restingShadow = globalThis.getComputedStyle(textarea).boxShadow;
  textarea.focus();
  const focusedShadow = globalThis.getComputedStyle(textarea).boxShadow;
  const focused = document.activeElement === textarea;
  textarea.blur();
  textarea.style.transition = '';
  return { focused, restingShadow, focusedShadow };
}

/** The focus promise: focusing the field shows a ring that is not there at rest. */
function checkFocus(name: string, textarea: HTMLTextAreaElement): readonly Check[] {
  const { focused, restingShadow, focusedShadow } = probeFocus(textarea);

  return [
    {
      name: `${name}: focusing it shows a focus indicator`,
      ok: focused && focusedShadow !== restingShadow && /\b2px\b/.test(focusedShadow),
      detail: `focused ${focused}, box-shadow ${restingShadow} -> ${focusedShadow}`,
    },
  ];
}

/** The semantics the border change must not cost: label, rows, placeholder, resize. */
function checkSemantics(name: string, textarea: HTMLTextAreaElement): readonly Check[] {
  const style = globalThis.getComputedStyle(textarea);
  const label = accessibleLabel(textarea);

  return [
    {
      name: `${name}: the textarea keeps its accessible label`,
      ok: label === 'Intake names',
      detail: `label "${label}"`,
    },
    {
      name: `${name}: it keeps eight rows and its placeholder`,
      ok: textarea.rows === 8 && textarea.placeholder === INTAKE_PASTE_PLACEHOLDER,
      detail: `rows ${textarea.rows}, placeholder "${textarea.placeholder}"`,
    },
    {
      name: `${name}: the user can still resize it`,
      ok: style.resize === 'vertical' || style.resize === 'both',
      detail: `resize ${style.resize}`,
    },
  ];
}

/** The fit promises: the field fills its column without leaving it, and shows its eight rows. */
function checkFit(name: string, px: number, textarea: HTMLTextAreaElement, card: Element): readonly Check[] {
  const box = textarea.getBoundingClientRect();
  const cardBox = card.getBoundingClientRect();
  const lineHeight = Number.parseFloat(globalThis.getComputedStyle(textarea).lineHeight) || 0;

  return [
    {
      name: `${name}: the textarea stays inside its card`,
      ok: box.left >= cardBox.left - OVERFLOW_TOLERANCE_PX && box.right <= cardBox.right + OVERFLOW_TOLERANCE_PX,
      detail: `textarea ${Math.round(box.left)}-${Math.round(box.right)}, card ${Math.round(cardBox.left)}-${Math.round(cardBox.right)} at ${px}px`,
    },
    {
      name: `${name}: the textarea has room for eight rows`,
      ok: box.height >= 8 * lineHeight,
      detail: `height ${Math.round(box.height)}px, eight lines ${Math.round(8 * lineHeight)}px at ${px}px`,
    },
    {
      name: `${name}: the textarea does not scroll sideways`,
      ok: textarea.scrollWidth <= textarea.clientWidth + OVERFLOW_TOLERANCE_PX,
      detail: `scrollWidth ${textarea.scrollWidth}, clientWidth ${textarea.clientWidth}`,
    },
  ];
}

/** Measures every wrapper on the page, reporting a missing wrapper as a failure. */
function measureAll(): readonly Check[] {
  return RAW_VARIANTS.flatMap(({ key: name, px }) => {
    const wrapper = document.querySelector(`[${WRAPPER_ATTRIBUTE}="${name}"]`);
    const parts = wrapper === null ? null : findParts(wrapper);
    if (parts === null) {
      return [{ name: `${name}: Raw rendered its textarea`, ok: false, detail: `no textarea at ${px}px` }];
    }
    return [
      ...checkBorder(name, parts.textarea, parts.card),
      ...checkSemantics(name, parts.textarea),
      ...checkFocus(name, parts.textarea),
      ...checkFit(name, px, parts.textarea, parts.card),
    ];
  });
}

/** Mounts the real Raw-mode intake body at each width in each theme and measures it once the textareas are on screen. */
export function SeasonIntakeRawFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(
    () =>
      measureWhenReady(
        () => document.querySelectorAll(`[${WRAPPER_ATTRIBUTE}] textarea`).length === RAW_VARIANTS.length,
        () => setChecks(measureAll()),
      ),
    [],
  );

  return (
    <>
      {RAW_VARIANTS.map(({ key, theme, px }) => (
        <div key={key} {...{ [WRAPPER_ATTRIBUTE]: key }} className={theme} data-theme={theme} style={{ width: px }}>
          <Card>
            <Card.Content>
              <IntakePanelBody {...RAW_VIEW_MODEL} />
            </Card.Content>
          </Card>
        </div>
      ))}
      <VerdictReport checks={checks} />
    </>
  );
}
