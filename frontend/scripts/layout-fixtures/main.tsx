import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import { NotificationToasts } from '../../src/features/notifications/ui/NotificationToasts/NotificationToasts';
import { renderAppNotificationToast } from '../../src/features/notifications/ui/NotificationToasts/app-notification.helpers';
import { ActivityDetailFixture } from './activity-detail-fixture';
import { checkThePage, measureWhenReady, VerdictReport, type Check } from './verdict';
import '../../src/style.css';

/**
 * Layout fixtures for `scripts/layout-smoke.mjs`.
 *
 * These mount REAL surfaces, feed them adversarial content, and then measure
 * what the browser actually laid out, writing one verdict per fixture into
 * `data-layout-verdict` for `--dump-dom` to read back. The run passes only when
 * every fixture on the page passed.
 *
 * The toast fixture mounts `NotificationToasts`, its provider and its app-owned
 * queue rather than calling its render function directly: HeroUI's `Toast`
 * reads context its provider owns, so a fixture that skipped the provider would
 * measure a component that threw. It is also the only version that keeps
 * measuring the right thing after the toast's own plumbing changes.
 *
 * jsdom has no layout engine and `render-smoke.mjs` dumps DOM without measuring
 * it, so nothing else in this repo can see an overflow. Both notification-toast
 * layout defects and the Activity detail card's horizontal page scroll shipped
 * through a green suite.
 */

/** The unbreakable-ish title that caused the original overflow, kept verbatim. */
const LONG_TITLE = 'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen - Ryoushu no Youjo';

/**
 * How much wider than HeroUI's own `--toast-width` the surface may grow.
 *
 * Read from the variable rather than pinned to a number, because HeroUI applies
 * it as a `min-width` -- and in CSS a min-width beats any max-width, so a
 * hardcoded cap of our own could never take effect. That was measured the hard
 * way: a `max-inline-size` added to `.toast-region` looked like the fix for the
 * original overflow and was inert the whole time.
 */
const TOAST_WIDTH_TOLERANCE_PX = 1;

/**
 * The share of the toast the row block must occupy.
 *
 * Below this the content is being squeezed by something beside it, which is
 * exactly the shape the actions took before they moved into a footer.
 */
const ROWS_WIDTH_SHARE = 0.7;

/**
 * Measures the rendered toast and reports every layout promise it must keep.
 *
 * Reads geometry rather than class names on purpose. Asserting that an element
 * carries `line-clamp-2` proves the class is present, not that anything wrapped;
 * only the box tells the truth.
 */
function measureToast(): readonly Check[] {
  const found = {
    '.toast': document.querySelector('.toast'),
    rows: document.querySelector('[data-testid="notification-toast-rows"]'),
    actions: document.querySelector('[data-testid="notification-toast-actions"]'),
  };
  const title = found.rows?.querySelector('p') ?? null;
  const missing = Object.entries({ ...found, title }).filter((entry) => entry[1] === null);

  if (missing.length > 0) {
    return [{ name: 'the toast rendered its own parts', ok: false, detail: describeMissingParts(missing.map((entry) => entry[0])) }];
  }

  // Narrowed by the guard above: every value was checked for null in one pass,
  // which TypeScript cannot follow through Object.entries. The alternative is
  // four separate checks, and four branches in a function with no test coverage
  // is exactly what the complexity gate exists to stop.
  const parts = { ...found, title } as { '.toast': Element; rows: Element; actions: Element; title: Element };
  return [
    ...checkTheSurface(parts['.toast'], parts.title),
    ...checkTheContent(parts['.toast'], parts.rows, parts.actions),
    checkThePage('the toast'),
  ];
}

/**
 * Names the parts that did not render. "It did not mount" is a dead end, and
 * the difference between an absent region and an absent row block is the whole
 * diagnosis.
 */
function describeMissingParts(missing: readonly string[]): string {
  const region = document.querySelector('.toast-region') === null ? 'absent' : 'present';
  return `missing: ${missing.join(', ')} | .toast-region ${region} | body chars ${document.body.textContent?.length ?? 0}`;
}

/** Reads the toast's own designed width, which HeroUI publishes as a variable. */
function readDesignedWidth(): { width: number; raw: string; minWidth: string } {
  const region = document.querySelector('.toast-region');
  if (!region) {
    return { width: 0, raw: '(no region)', minWidth: '(none)' };
  }
  const style = globalThis.getComputedStyle(region);
  const raw = style.getPropertyValue('--toast-width').trim();
  return { width: Number.parseFloat(raw) || 0, raw: raw || '(unset)', minWidth: style.minWidth };
}

/** Counts the rendered lines of one text element. */
function countLines(element: Element): number {
  const height = element.getBoundingClientRect().height;
  return Math.round(height / Number.parseFloat(globalThis.getComputedStyle(element).lineHeight));
}

/** What the surface itself promises: a bounded width holding a wrapped title. */
function checkTheSurface(surface: Element, title: Element): readonly Check[] {
  const designed = readDesignedWidth();
  const surfaceBox = surface.getBoundingClientRect();
  const titleBox = title.getBoundingClientRect();

  return [
    {
      name: 'the surface stays at the width its own design gives it',
      ok: surfaceBox.width <= designed.width + TOAST_WIDTH_TOLERANCE_PX,
      detail: `toast ${Math.round(surfaceBox.width)}px, --toast-width ${designed.raw}, min-width ${designed.minWidth}`,
    },
    {
      name: 'a long title stays inside the toast',
      ok: titleBox.right <= surfaceBox.right + 1,
      detail: `title right ${Math.round(titleBox.right)}, toast right ${Math.round(surfaceBox.right)}`,
    },
    {
      name: 'a long title wraps rather than running off',
      ok: countLines(title) > 1,
      detail: `${countLines(title)} line(s)`,
    },
  ];
}

/** How the content is arranged inside it: actions under the rows, not beside them. */
function checkTheContent(surface: Element, rows: Element, actions: Element): readonly Check[] {
  const surfaceBox = surface.getBoundingClientRect();
  const rowsBox = rows.getBoundingClientRect();
  const actionsBox = actions.getBoundingClientRect();

  return [
    {
      name: 'the actions sit below the rows, not beside them',
      ok: actionsBox.top >= rowsBox.bottom - 1,
      detail: `actions top ${Math.round(actionsBox.top)}, rows bottom ${Math.round(rowsBox.bottom)}`,
    },
    {
      name: 'the rows use the width the actions are no longer taking',
      ok: rowsBox.width >= surfaceBox.width * ROWS_WIDTH_SHARE,
      detail: `rows ${Math.round(rowsBox.width)}px of ${Math.round(surfaceBox.width)}px`,
    },
  ];
}

/**
 * Queues the notification under test.
 *
 * Called once, outside React, before anything renders. The toast region only
 * exists while the queue holds something, so pushing from an effect leaves a
 * window where the provider has mounted with an empty queue -- and under
 * StrictMode's double-invocation that window is where the measurement kept
 * landing.
 */
function pushToastUnderTest() {
  renderAppNotificationToast({
    severity: 'info',
    // Persistent so the toast does not dismiss itself before it is measured:
    // headless Edge fast-forwards the clock, so an ordinary toast's four-second
    // timeout would elapse almost immediately. The fixture is about layout, not
    // lifetime.
    persistent: true,
    title: 'Anime download started',
    description: `Download check started for ${LONG_TITLE}.`,
    recordId: 42,
    rows: [{ refType: 'anime', refId: 'a-1', name: LONG_TITLE, status: 'queued', detail: 'waiting for this run to reach it' }],
    actions: [{ label: 'Open Downloads', onPress: () => undefined }],
  });
}

/**
 * Mounts the real toast surface, pushes the adversarial notification through it,
 * and measures once the toast is actually on screen.
 *
 * It polls rather than measuring one frame later. The queue's add, the
 * provider's re-render and HeroUI's own entrance are three separate steps, and
 * a single frame lands in the middle of them -- which reads as "nothing
 * mounted" and would make this gate fail for a reason that has nothing to do
 * with layout. The attempt budget is what keeps a genuinely broken fixture from
 * hanging instead of failing.
 */
function ToastFixture() {
  const [checks, setChecks] = useState<readonly Check[] | undefined>();

  useEffect(() => {
    pushToastUnderTest();

    return measureWhenReady(
      () => document.querySelector('[data-testid="notification-toast-actions"]') !== null,
      () => setChecks(measureToast()),
    );
  }, []);

  return (
    <>
      {/*
        The toast surface navigates -- a pressed "View details" opens the record
        -- so it needs the router the real app mounts it under (`src/main.tsx`
        uses HashRouter). Without it the whole fixture throws on mount and the
        page measures nothing.
      */}
      <HashRouter>
        <NotificationToasts />
      </HashRouter>
      <VerdictReport checks={checks} />
    </>
  );
}

/**
 * Every fixture on the page, in one render.
 *
 * They share a page rather than a page each because `layout-smoke.mjs` renders
 * one URL: a second page would double the build, the serve and the headless
 * render for a guard whose subjects do not interact -- the toast is a fixed
 * overlay and the Activity cards are ordinary flow.
 */
function LayoutFixtures() {
  return (
    <>
      <ToastFixture />
      <ActivityDetailFixture />
    </>
  );
}

pushToastUnderTest();

// No StrictMode: its deliberate double-mount tears the toast provider's
// subscription down and back up, and this page measures the DOM rather than
// exercising the component's resilience to that. The app mounts under
// StrictMode; the suite is where that gets asserted.
createRoot(document.getElementById('root') as HTMLElement).render(<LayoutFixtures />);
