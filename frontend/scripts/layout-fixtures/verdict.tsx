/**
 * The little bit of plumbing every layout fixture on the page shares: the shape
 * of one measured assertion, the node `layout-smoke.mjs` reads its verdict back
 * from, and the poll that decides when there is something worth measuring.
 *
 * It is shared rather than copied because `layout-smoke.mjs` parses these nodes
 * by attribute, and a second fixture that spelled the attribute or the
 * `pending` state differently would be silently unreadable -- a fixture that
 * cannot fail is exactly what this harness exists to prevent.
 */

/** One measured assertion: what was checked, and whether it held. */
export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * How many polls a fixture spends waiting for its subject before giving up.
 *
 * Counted in ATTEMPTS rather than milliseconds. Headless Edge runs this page
 * under `--virtual-time-budget`, which fast-forwards the clock between timers --
 * so a wall-clock deadline expires after two or three real ticks and reports
 * "nothing mounted" for a subject that was still one render away.
 */
const MOUNT_POLL_ATTEMPTS = 60;

/**
 * Measures once `isReady` says the subject is on screen, or once the attempts
 * run out -- measuring anyway, so a subject that never mounted reports a failed
 * check rather than hanging on `pending` forever.
 *
 * Runs on timers rather than animation frames: `requestAnimationFrame` waits on
 * a compositor that `--disable-gpu` never starts.
 *
 * @param isReady Whether the subject is mounted and worth measuring.
 * @param onMeasured Called exactly once, with the fixture's own measurement.
 * @returns A cleanup that cancels the pending poll.
 */
export function measureWhenReady(isReady: () => boolean, onMeasured: () => void): () => void {
  let attemptsLeft = MOUNT_POLL_ATTEMPTS;
  let timer = 0;

  const poll = () => {
    attemptsLeft -= 1;
    if (isReady() || attemptsLeft <= 0) {
      onMeasured();
      return;
    }
    timer = globalThis.setTimeout(poll, 16);
  };

  timer = globalThis.setTimeout(poll, 16);
  return () => globalThis.clearTimeout(timer);
}

/**
 * The node `layout-smoke.mjs` reads back with `--dump-dom`.
 *
 * `pending` (nothing measured yet) is deliberately its own value rather than a
 * pass: the harness treats it as a failure, because a page that never measured
 * is the state a broken fixture leaves behind.
 */
export function VerdictReport({ checks }: Readonly<{ checks: readonly Check[] | undefined }>) {
  const verdict = checks === undefined ? 'pending' : checks.every((check) => check.ok) ? 'pass' : 'fail';

  return (
    <pre data-layout-verdict={verdict}>
      {(checks ?? []).map((check) => `${check.ok ? 'ok  ' : 'FAIL'} ${check.name} — ${check.detail}`).join('\n')}
    </pre>
  );
}

/** The promise every surface makes to the window it renders in. */
export function checkThePage(subject: string): Check {
  return {
    name: `${subject}: the page never scrolls sideways`,
    ok: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    detail: `scrollWidth ${document.documentElement.scrollWidth}, clientWidth ${document.documentElement.clientWidth}`,
  };
}
